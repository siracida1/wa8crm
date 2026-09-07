import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { supabase } = await getCurrentAccount()

    const [{ data: campaign, error: campaignError }, { data: logs, error: logsError }, { data: unsubs }] =
      await Promise.all([
        supabase.from('email_campaigns').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('email_campaign_logs')
          .select('id, recipient, subject, status, message_id, error, opened_at, open_count, clicked_at, click_count, sent_at')
          .eq('campaign_id', id)
          .order('sent_at', { ascending: false }),
        supabase.from('email_unsubscribes').select('email'),
      ])

    if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 })
    if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 })

    const unsubscribed = new Set((unsubs ?? []).map((u) => u.email.toLowerCase()))
    const rows = (logs ?? []).map((l) => ({
      ...l,
      unsubscribed: unsubscribed.has(l.recipient.toLowerCase()),
    }))

    return NextResponse.json({ campaign, logs: rows })
  } catch (err) {
    return toErrorResponse(err)
  }
}
