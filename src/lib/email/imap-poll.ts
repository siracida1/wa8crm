import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

interface SenderRow {
  id: string
  account_id: string
  name: string
  email: string
  imap_host: string
  imap_port: number
  imap_user: string
  imap_password: string
  imap_last_uid: number
}

function normalizeSubject(subject: string | undefined): string {
  return (subject ?? '(sin asunto)')
    .replace(/^\s*(re|fwd?|rv)\s*:\s*/i, '')
    .trim()
    .toLowerCase()
}

function threadKey(subject: string | undefined, counterpart: string): string {
  return `${normalizeSubject(subject)}::${counterpart.toLowerCase()}`
}

/**
 * Polls one mailbox for messages newer than its watermark. On the very
 * first poll (imap_last_uid = 0) it does NOT backfill the mailbox's
 * history — it just records the current highest UID and returns, so
 * connecting a mailbox with years of mail doesn't flood the inbox.
 *
 * Returns the number of messages imported.
 */
export async function pollSenderInbox(sender: SenderRow): Promise<number> {
  const admin = supabaseAdmin()
  const client = new ImapFlow({
    host: sender.imap_host,
    port: sender.imap_port,
    secure: sender.imap_port === 993,
    auth: { user: sender.imap_user, pass: sender.imap_password },
    logger: false,
  })

  let imported = 0
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const status = await client.status('INBOX', { uidNext: true })
      const highestUid = (status.uidNext ?? 1) - 1

      if (sender.imap_last_uid === 0) {
        // Bootstrap — don't import history, just start watching from here.
        await admin.from('email_senders').update({ imap_last_uid: highestUid }).eq('id', sender.id)
        return 0
      }

      if (highestUid <= sender.imap_last_uid) return 0

      const range = `${sender.imap_last_uid + 1}:${highestUid}`
      let maxUidSeen = sender.imap_last_uid

      for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (msg.uid > maxUidSeen) maxUidSeen = msg.uid
        if (!msg.source) continue

        const parsed = await simpleParser(msg.source)
        const fromAddr = parsed.from?.value?.[0]
        const fromEmail = fromAddr?.address ?? 'unknown'
        // Never file the mailbox's own sent-and-synced copies as inbound.
        if (fromEmail.toLowerCase() === sender.email.toLowerCase()) continue

        const subject = parsed.subject ?? undefined
        const messageId = parsed.messageId ?? null
        const inReplyTo = Array.isArray(parsed.inReplyTo)
          ? parsed.inReplyTo[0]
          : (parsed.inReplyTo as string | undefined) ?? null

        await admin.from('email_inbox_messages').upsert(
          {
            account_id: sender.account_id,
            sender_id: sender.id,
            uid: msg.uid,
            thread_key: threadKey(subject, fromEmail),
            message_id: messageId,
            in_reply_to: inReplyTo,
            from_email: fromEmail,
            from_name: fromAddr?.name ?? null,
            to_email: sender.email,
            subject: subject ?? null,
            body_text: parsed.text ?? null,
            body_html: typeof parsed.html === 'string' ? parsed.html : null,
            direction: 'inbound',
            received_at: (parsed.date ?? new Date()).toISOString(),
          },
          { onConflict: 'sender_id,uid', ignoreDuplicates: true },
        )
        imported++

        await runAutomationsForTrigger({
          accountId: sender.account_id,
          triggerType: 'email_replied',
          context: { recipientEmail: fromEmail },
        })
      }

      await admin.from('email_senders').update({ imap_last_uid: maxUidSeen }).eq('id', sender.id)
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }

  return imported
}

export { threadKey }
