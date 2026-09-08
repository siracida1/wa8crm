import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// Email Marketing module: SMTP sending accounts. GET lists (any member —
// needed to pick a sender in the campaign wizard); POST creates (admin+,
// holds an SMTP credential). Mirrors the api-keys / quick-replies routes.

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('email_senders')
      .select('id, name, email, host, port, smtp_user, is_default, imap_host, imap_port, imap_user, signature_html, provider, created_at')
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ senders: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const provider = body.provider === 'brevo' ? 'brevo' : 'smtp'
  const host = typeof body.host === 'string' ? body.host.trim() : ''
  const port = Number(body.port)
  const smtp_user = typeof body.smtp_user === 'string' ? body.smtp_user.trim() : ''
  const smtp_password = typeof body.smtp_password === 'string' ? body.smtp_password : ''
  const brevo_api_key = typeof body.brevo_api_key === 'string' ? body.brevo_api_key.trim() : ''
  const is_default = Boolean(body.is_default)

  // IMAP is optional — a sender with none of these just can't receive
  // into the Inbox, it can still send campaigns/sequences fine.
  const imap_host = typeof body.imap_host === 'string' ? body.imap_host.trim() : ''
  const imap_port = body.imap_port !== undefined && body.imap_port !== '' ? Number(body.imap_port) : null
  const imap_user = typeof body.imap_user === 'string' ? body.imap_user.trim() : ''
  const imap_password = typeof body.imap_password === 'string' ? body.imap_password : ''
  const hasImap = imap_host || imap_user || imap_password
  if (hasImap && (!imap_host || !Number.isFinite(imap_port) || !imap_user || !imap_password)) {
    return NextResponse.json(
      { error: 'Si configurás IMAP, host, puerto, usuario y contraseña son todos requeridos' },
      { status: 400 },
    )
  }

  if (!name || !email) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  if (provider === 'brevo') {
    if (!brevo_api_key) {
      return NextResponse.json({ error: 'Falta la API key de Brevo' }, { status: 400 })
    }
  } else if (!host || !Number.isFinite(port) || !smtp_user || !smtp_password) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  if (is_default) {
    await admin.from('email_senders').update({ is_default: false }).eq('account_id', ctx.accountId)
  }

  const { data, error } = await admin
    .from('email_senders')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      name,
      email,
      provider,
      host: provider === 'smtp' ? host : null,
      port: provider === 'smtp' ? port : 587,
      smtp_user: provider === 'smtp' ? smtp_user : null,
      smtp_password: provider === 'smtp' ? smtp_password : null,
      brevo_api_key: provider === 'brevo' ? brevo_api_key : null,
      is_default,
      imap_host: hasImap ? imap_host : null,
      imap_port: hasImap ? imap_port : null,
      imap_user: hasImap ? imap_user : null,
      imap_password: hasImap ? imap_password : null,
      signature_html: typeof body.signature_html === 'string' ? body.signature_html : null,
    })
    .select('id, name, email, host, port, smtp_user, is_default, imap_host, imap_port, imap_user, signature_html, provider, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sender: data }, { status: 201 })
}
