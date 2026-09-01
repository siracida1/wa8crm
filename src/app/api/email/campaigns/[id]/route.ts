import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// Marks a campaign as finished — called by the client once every
// recipient in the wizard's send loop has been processed.
export async function PATCH(
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

  const body = await request.json().catch(() => ({}))
  const status = body.status === 'failed' ? 'failed' : 'completed'

  const { error } = await supabaseAdmin()
    .from('email_campaigns')
    .update({ status, completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
