import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

// Public, unauthenticated — the recipient's browser hits this when they
// click a tracked link. Always redirects somewhere sensible even if
// tracking itself fails, so a broken log row never breaks the link.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const target = new URL(request.url).searchParams.get('u')

  let redirectTo = '/'
  if (target) {
    try {
      const parsed = new URL(target)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        redirectTo = parsed.toString()
      }
    } catch {
      // fall through to '/'
    }
  }

  try {
    const admin = supabaseAdmin()
    const { data: log } = await admin
      .from('email_campaign_logs')
      .select('id, account_id, list_id, recipient, recipient_data, clicked_at, click_count')
      .eq('id', id)
      .maybeSingle()

    if (log) {
      const firstClick = !log.clicked_at
      await admin
        .from('email_campaign_logs')
        .update({
          clicked_at: log.clicked_at ?? new Date().toISOString(),
          click_count: log.click_count + 1,
        })
        .eq('id', id)

      if (firstClick) {
        await runAutomationsForTrigger({
          accountId: log.account_id,
          triggerType: 'email_clicked',
          context: {
            list_id: log.list_id ?? undefined,
            recipientEmail: log.recipient,
            recipientData: (log.recipient_data as Record<string, string> | null) ?? undefined,
          },
        })
      }
    }
  } catch (err) {
    console.error('[email/track/click] failed:', err)
  }

  return NextResponse.redirect(redirectTo, { status: 302 })
}
