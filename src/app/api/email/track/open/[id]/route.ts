import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { transparentGif } from '@/lib/email/tracking'

// Public, unauthenticated — hit directly by the recipient's mail
// client loading the tracking pixel, so there's no Supabase session to
// check. Always returns the gif with 200, even on internal errors:
// breaking the pixel would show a broken-image icon in the email.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const admin = supabaseAdmin()
    const { data: log } = await admin
      .from('email_campaign_logs')
      .select('id, account_id, list_id, recipient, recipient_data, opened_at, open_count')
      .eq('id', id)
      .maybeSingle()

    if (log) {
      const firstOpen = !log.opened_at
      await admin
        .from('email_campaign_logs')
        .update({
          opened_at: log.opened_at ?? new Date().toISOString(),
          open_count: log.open_count + 1,
        })
        .eq('id', id)

      // Only dispatch on the first open — a recipient reopening the
      // same email (or their mail client re-fetching the pixel) would
      // otherwise re-run the whole automation every time.
      if (firstOpen) {
        await runAutomationsForTrigger({
          accountId: log.account_id,
          triggerType: 'email_opened',
          context: {
            list_id: log.list_id ?? undefined,
            recipientEmail: log.recipient,
            recipientData: (log.recipient_data as Record<string, string> | null) ?? undefined,
          },
        })
      }
    }
  } catch (err) {
    console.error('[email/track/open] failed:', err)
  }

  return new NextResponse(new Uint8Array(transparentGif()), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
