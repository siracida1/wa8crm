import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { verifyBrevoKey } from '@/lib/email/brevo'

interface SmtpConfig {
  provider: 'smtp'
  name: string
  email: string
  host: string
  port: number
  smtp_user: string
  smtp_password: string
}

interface BrevoConfig {
  provider: 'brevo'
  brevo_api_key: string
}

// Verifies SMTP credentials without persisting anything. Two ways to call
// it: with an `id` (re-test an already-saved sender — the stored password
// never leaves the server) or with an inline config (testing the form
// before the first save, same as EMKT Zittex's original flow).
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  let config: SmtpConfig | BrevoConfig

  if (typeof body.id === 'string') {
    const { data, error } = await supabaseAdmin()
      .from('email_senders')
      .select('name, email, host, port, smtp_user, smtp_password, provider, brevo_api_key')
      .eq('id', body.id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Cuenta no encontrada' }, { status: 404 })
    }
    config = data.provider === 'brevo'
      ? { provider: 'brevo', brevo_api_key: data.brevo_api_key }
      : { ...data, provider: 'smtp' }
  } else if (body.provider === 'brevo') {
    if (typeof body.brevo_api_key !== 'string' || !body.brevo_api_key) {
      return NextResponse.json({ success: false, error: 'Falta la API key de Brevo' }, { status: 400 })
    }
    config = { provider: 'brevo', brevo_api_key: body.brevo_api_key }
  } else {
    const port = Number(body.port)
    if (
      typeof body.name !== 'string' ||
      typeof body.email !== 'string' ||
      typeof body.host !== 'string' ||
      !Number.isFinite(port) ||
      typeof body.smtp_user !== 'string' ||
      typeof body.smtp_password !== 'string' ||
      !body.name || !body.email || !body.host || !body.smtp_user || !body.smtp_password
    ) {
      return NextResponse.json({ success: false, error: 'Faltan campos requeridos' }, { status: 400 })
    }
    config = {
      provider: 'smtp',
      name: body.name,
      email: body.email,
      host: body.host,
      port,
      smtp_user: body.smtp_user,
      smtp_password: body.smtp_password,
    }
  }

  try {
    if (config.provider === 'brevo') {
      const result = await verifyBrevoKey(config.brevo_api_key)
      return NextResponse.json(result)
    }
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port),
      secure: Number(config.port) === 465,
      auth: { user: config.smtp_user, pass: config.smtp_password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })
    await transporter.verify()
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}
