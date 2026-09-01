import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaigns: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// Creates the campaign row up front (status 'sending'); the client then
// calls /send-one once per recipient with a delay in between, same
// client-driven pacing the original EMKT Zittex wizard used, just routed
// through this backend instead of the old Express app.
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const sender_id = typeof body.sender_id === 'string' ? body.sender_id : null
  const template_id = typeof body.template_id === 'string' ? body.template_id : null
  const total_recipients = Number(body.total_recipients) || 0
  const send_delay_ms = Number.isFinite(Number(body.send_delay_ms)) ? Number(body.send_delay_ms) : 1000
  const max_retries = Number.isFinite(Number(body.max_retries)) ? Number(body.max_retries) : 1

  if (!name || !sender_id || !template_id || total_recipients === 0) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('email_campaigns')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      name,
      sender_id,
      template_id,
      total_recipients,
      send_delay_ms,
      max_retries,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data }, { status: 201 })
}
