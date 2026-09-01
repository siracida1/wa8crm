import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// Full recipient rows for one list — used for CSV export (built
// client-side from this, same as the original EMKT Zittex flow) and,
// later, as the audience source for the campaign wizard's send step.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('email_list_recipients')
      .select('id, email, data')
      .eq('list_id', id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ recipients: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
