import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function personalize(subject: string, html: string, recipient: Record<string, string>) {
  let personalizedSubject = subject
  let personalizedHtml = html
  for (const key of Object.keys(recipient)) {
    const regex = new RegExp(`{{${escapeRegExp(key)}}}`, 'g')
    personalizedSubject = personalizedSubject.replace(regex, recipient[key] ?? '')
    personalizedHtml = personalizedHtml.replace(regex, recipient[key] ?? '')
  }
  personalizedHtml = personalizedHtml.replace(/{{name}}/g, recipient.name || recipient.nombre || 'Cliente')
  return { subject: personalizedSubject, html: personalizedHtml }
}

// Sends ONE email for one recipient of a campaign: loads the campaign's
// sender + template server-side (the SMTP password never leaves the
// server), personalizes the content, sends with an internal retry loop
// (up to campaign.max_retries), logs the outcome, and bumps the
// campaign's running counters. The wizard calls this once per recipient
// with a delay between calls — same pacing model the original EMKT
// Zittex client-side loop used.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const recipient = body?.recipient as { email?: string; [key: string]: unknown } | undefined
  if (!recipient?.email || typeof recipient.email !== 'string') {
    return NextResponse.json({ error: 'recipient.email es requerido' }, { status: 400 })
  }
  const recipientData: Record<string, string> = {}
  for (const [k, v] of Object.entries(recipient)) {
    if (typeof v === 'string') recipientData[k] = v
  }

  const admin = supabaseAdmin()

  const { data: campaign, error: campaignError } = await admin
    .from('email_campaigns')
    .select('id, sender_id, template_id, send_delay_ms, max_retries, sent_count, failed_count')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }

  const [{ data: sender }, { data: template }] = await Promise.all([
    admin
      .from('email_senders')
      .select('name, email, host, port, smtp_user, smtp_password')
      .eq('id', campaign.sender_id)
      .maybeSingle(),
    admin
      .from('email_templates')
      .select('subject, html_content')
      .eq('id', campaign.template_id)
      .maybeSingle(),
  ])
  if (!sender || !template) {
    return NextResponse.json({ error: 'Falta la cuenta de envío o la plantilla' }, { status: 400 })
  }

  const { subject, html } = personalize(template.subject, template.html_content, recipientData)

  const transporter = nodemailer.createTransport({
    host: sender.host,
    port: Number(sender.port),
    secure: Number(sender.port) === 465,
    auth: { user: sender.smtp_user, pass: sender.smtp_password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  })

  let result: { success: boolean; messageId?: string; error?: string } = {
    success: false,
    error: 'No se pudo enviar.',
  }
  let attempt = 0
  const maxAttempts = campaign.max_retries + 1

  for (attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: `"${sender.name}" <${sender.email}>`,
        to: recipient.email,
        subject,
        html,
      })
      result = { success: true, messageId: info.messageId }
      break
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) }
    }
    if (attempt < maxAttempts) {
      await sleep(Math.min(campaign.send_delay_ms, 5000))
    }
  }

  await admin.from('email_campaign_logs').insert({
    campaign_id: id,
    account_id: ctx.accountId,
    recipient: recipient.email,
    recipient_data: recipientData,
    subject,
    status: result.success ? 'sent' : 'failed',
    message_id: result.messageId ?? null,
    error: result.error ?? null,
    attempt,
  })

  await admin
    .from('email_campaigns')
    .update({
      sent_count: campaign.sent_count + (result.success ? 1 : 0),
      failed_count: campaign.failed_count + (result.success ? 0 : 1),
    })
    .eq('id', id)

  return NextResponse.json(result)
}
