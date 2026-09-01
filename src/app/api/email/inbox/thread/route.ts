import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// Query-param based (not a [key] path segment) since thread_key embeds
// arbitrary subject text that would need careful path-encoding.
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('email_inbox_messages')
      .select('*')
      .eq('thread_key', key)
      .order('received_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// Marks every inbound message in a thread as read.
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null)
  const key = body?.thread_key
  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'thread_key is required' }, { status: 400 })
  }

  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { error } = await supabaseAdmin()
    .from('email_inbox_messages')
    .update({ is_read: true })
    .eq('thread_key', key)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
