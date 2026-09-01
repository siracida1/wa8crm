import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (typeof body.email === 'string') update.email = body.email.trim()
  if (typeof body.host === 'string') update.host = body.host.trim()
  if (body.port !== undefined) {
    const port = Number(body.port)
    if (!Number.isFinite(port)) return NextResponse.json({ error: 'port invalido' }, { status: 400 })
    update.port = port
  }
  if (typeof body.smtp_user === 'string') update.smtp_user = body.smtp_user.trim()
  // Only overwrite the stored password when the client actually sent a new
  // one — the edit form leaves this blank to mean "keep the current secret",
  // same convention EMKT Zittex used for its account edit modal.
  if (typeof body.smtp_password === 'string' && body.smtp_password.length > 0) {
    update.smtp_password = body.smtp_password
  }
  if ('is_default' in body) update.is_default = Boolean(body.is_default)
  update.updated_at = new Date().toISOString()

  const admin = supabaseAdmin()

  if (update.is_default === true) {
    await admin.from('email_senders').update({ is_default: false }).eq('account_id', ctx.accountId)
  }

  const { error } = await admin
    .from('email_senders')
    .update(update)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { error } = await supabaseAdmin()
    .from('email_senders')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
