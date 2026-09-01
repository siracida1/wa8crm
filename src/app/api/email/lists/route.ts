import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

interface RecipientInput {
  email: string
  [key: string]: string
}

// GET lists every list for the account plus its recipient count (one
// query via a Postgres count aggregate, no N+1). POST creates a list AND
// bulk-inserts its recipients in one call — the client already parsed,
// mapped, validated and deduped the CSV rows before calling this.
export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('email_lists')
      .select('*, email_list_recipients(count)')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const lists = (data ?? []).map((row) => {
      const { email_list_recipients, ...rest } = row as typeof row & {
        email_list_recipients: { count: number }[]
      }
      return { ...rest, recipient_count: email_list_recipients?.[0]?.count ?? 0 }
    })
    return NextResponse.json({ lists })
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
  const recipients: RecipientInput[] = Array.isArray(body.recipients) ? body.recipients : []

  if (!name) return NextResponse.json({ error: 'El nombre de la lista es obligatorio' }, { status: 400 })
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'La lista necesita al menos un destinatario válido' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: list, error: listError } = await admin
    .from('email_lists')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      name,
      classification: typeof body.classification === 'string' ? body.classification.trim() || null : null,
      zone: typeof body.zone === 'string' ? body.zone.trim() || null : null,
      city: typeof body.city === 'string' ? body.city.trim() || null : null,
      country: typeof body.country === 'string' ? body.country.trim() || null : null,
      source_file_name: typeof body.source_file_name === 'string' ? body.source_file_name || null : null,
    })
    .select('*')
    .single()

  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const rows = recipients
    .filter((r) => typeof r.email === 'string' && r.email.trim())
    .map((r) => ({
      list_id: list.id,
      account_id: ctx.accountId,
      email: r.email.trim(),
      data: r,
    }))

  const { error: recipientsError } = await admin.from('email_list_recipients').insert(rows)
  if (recipientsError) {
    // Roll back the just-created list so a failed bulk insert doesn't
    // leave an empty, unusable list behind.
    await admin.from('email_lists').delete().eq('id', list.id)
    return NextResponse.json({ error: recipientsError.message }, { status: 500 })
  }

  // Fire email_list_joined once per recipient — cheap early exit when
  // the account has no active sequence listening, so bulk imports on
  // accounts not using this feature pay no extra cost. Awaited (not
  // fire-and-forget) since this runs in a serverless function that may
  // freeze the moment the response is sent.
  const { count: activeCount } = await admin
    .from('automations')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId)
    .eq('trigger_type', 'email_list_joined')
    .eq('is_active', true)
  if (activeCount && activeCount > 0) {
    await Promise.all(
      rows.map((row) =>
        runAutomationsForTrigger({
          accountId: ctx.accountId,
          triggerType: 'email_list_joined',
          context: { list_id: list.id, recipientEmail: row.email, recipientData: row.data },
        }),
      ),
    )
  }

  return NextResponse.json({ list: { ...list, recipient_count: rows.length } }, { status: 201 })
}
