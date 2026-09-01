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
      .select('id, name, email, host, port, smtp_user, is_default, created_at')
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
  const host = typeof body.host === 'string' ? body.host.trim() : ''
  const port = Number(body.port)
  const smtp_user = typeof body.smtp_user === 'string' ? body.smtp_user.trim() : ''
  const smtp_password = typeof body.smtp_password === 'string' ? body.smtp_password : ''
  const is_default = Boolean(body.is_default)

  if (!name || !email || !host || !Number.isFinite(port) || !smtp_user || !smtp_password) {
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
      host,
      port,
      smtp_user,
      smtp_password,
      is_default,
    })
    .select('id, name, email, host, port, smtp_user, is_default, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sender: data }, { status: 201 })
}
