import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { pollSenderInbox } from '@/lib/email/imap-poll'

// Polls every sender that has IMAP configured. Meant to be hit on a
// schedule (same pattern as /api/automations/cron) — requires a shared
// secret via the `x-cron-secret` header matching EMAIL_INBOX_CRON_SECRET.
export async function GET(request: Request) {
  const expected = process.env.EMAIL_INBOX_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const { data: senders, error } = await admin
    .from('email_senders')
    .select('id, account_id, name, email, imap_host, imap_port, imap_user, imap_password, imap_last_uid')
    .not('imap_host', 'is', null)
    .not('imap_user', 'is', null)
    .not('imap_password', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!senders || senders.length === 0) return NextResponse.json({ polled: 0, imported: 0 })

  let imported = 0
  const results: { sender_id: string; ok: boolean; error?: string }[] = []

  for (const sender of senders) {
    try {
      const count = await pollSenderInbox(
        sender as {
          id: string
          account_id: string
          name: string
          email: string
          imap_host: string
          imap_port: number
          imap_user: string
          imap_password: string
          imap_last_uid: number
        },
      )
      imported += count
      results.push({ sender_id: sender.id, ok: true })
    } catch (err) {
      results.push({
        sender_id: sender.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ polled: senders.length, imported, results })
}
