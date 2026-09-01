import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ templates: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

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
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const html_content = typeof body.html_content === 'string' ? body.html_content : ''

  if (!subject.trim()) {
    return NextResponse.json({ error: 'El asunto es obligatorio' }, { status: 400 })
  }
  if (!html_content.trim()) {
    return NextResponse.json({ error: 'El contenido HTML es obligatorio' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('email_templates')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      name: name || subject,
      subject,
      html_content,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}
