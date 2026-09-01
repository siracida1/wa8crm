import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// Sends a reply from within a thread using that mailbox's own SMTP
// credentials, threaded via In-Reply-To/References against the last
// inbound message, then files the sent copy into the same
// email_inbox_messages table (direction='outbound') so it renders in
// the thread like any other message.
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const senderId = body?.sender_id
  const threadKey = body?.thread_key
  const to = body?.to
  const html = body?.html
  const subject = body?.subject

  if (
    typeof senderId !== 'string' ||
    typeof threadKey !== 'string' ||
    typeof to !== 'string' ||
    typeof html !== 'string' ||
    typeof subject !== 'string' ||
    !to.trim() ||
    !html.trim()
  ) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: sender } = await admin
    .from('email_senders')
    .select('name, email, host, port, smtp_user, smtp_password')
    .eq('id', senderId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (!sender) return NextResponse.json({ error: 'Cuenta de envío no encontrada' }, { status: 404 })

  const { data: lastInbound } = await admin
    .from('email_inbox_messages')
    .select('message_id')
    .eq('thread_key', threadKey)
    .eq('account_id', ctx.accountId)
    .eq('direction', 'inbound')
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const transporter = nodemailer.createTransport({
    host: sender.host,
    port: Number(sender.port),
    secure: Number(sender.port) === 465,
    auth: { user: sender.smtp_user, pass: sender.smtp_password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  })

  let info
  try {
    info = await transporter.sendMail({
      from: `"${sender.name}" <${sender.email}>`,
      to,
      subject,
      html,
      inReplyTo: lastInbound?.message_id ?? undefined,
      references: lastInbound?.message_id ?? undefined,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo enviar' },
      { status: 502 },
    )
  }

  await admin.from('email_inbox_messages').insert({
    account_id: ctx.accountId,
    sender_id: senderId,
    // Outbound rows share the inbound UID space per (sender_id, uid)
    // uniqueness; negate the epoch-ms timestamp so they never collide
    // with a real IMAP UID (always positive).
    uid: -Date.now(),
    thread_key: threadKey,
    message_id: info.messageId,
    in_reply_to: lastInbound?.message_id ?? null,
    from_email: sender.email,
    from_name: sender.name,
    to_email: to,
    subject,
    body_html: html,
    direction: 'outbound',
    is_read: true,
    received_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, message_id: info.messageId })
}
