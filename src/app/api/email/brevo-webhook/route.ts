import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// Brevo webhook receiver — the piece direct SMTP can't give us: SMTP
// "success" only means the recipient's server accepted the message for
// delivery, not that it actually reached the inbox. Brevo tracks what
// happens next (hard bounce, spam complaint, blocked) and calls this URL.
// Configure it per-account in Brevo → Settings → Webhooks as:
//   https://wa.zittex.com/api/email/brevo-webhook?account=<accountId>
// A hard bounce or spam complaint auto-unsubscribes the address so no
// future campaign/sequence ever sends to it again.

const BAD_EVENTS = new Set(['hard_bounce', 'spam', 'blocked', 'invalid_email'])

interface BrevoEvent {
  event?: string
  email?: string
  reason?: string
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account')
  if (!accountId) {
    return NextResponse.json({ error: 'Falta ?account=<accountId> en la URL del webhook' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const events: BrevoEvent[] = Array.isArray(body) ? body : [body]
  const admin = supabaseAdmin()

  for (const evt of events) {
    if (!evt.event || !evt.email || !BAD_EVENTS.has(evt.event)) continue
    const email = evt.email.toLowerCase()

    const { data: log } = await admin
      .from('email_campaign_logs')
      .select('id')
      .eq('account_id', accountId)
      .ilike('recipient', email)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (log) {
      await admin
        .from('email_campaign_logs')
        .update({ status: 'failed', error: `Brevo: ${evt.event}${evt.reason ? ` — ${evt.reason}` : ''}` })
        .eq('id', log.id)
    }

    await admin
      .from('email_unsubscribes')
      .upsert({ account_id: accountId, email }, { onConflict: 'account_id,email' })
  }

  return NextResponse.json({ ok: true })
}
