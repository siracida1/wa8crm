import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTrackingBaseUrl } from './tracking'

/** Added AFTER wrapHtmlForTracking, not before — an unsubscribe link
 *  must never get click-tracking-rewrapped (that would fire an
 *  email_clicked automation trigger for someone opting OUT). */
export function appendUnsubscribeFooter(html: string, logId: string): string {
  const base = resolveTrackingBaseUrl()
  const url = `${base}/api/email/unsubscribe/${logId}`
  const footer = `<p style="font-size:11px;color:#888;margin-top:24px">
    <a href="${url}" style="color:#888">Darse de baja de estos emails</a>
  </p>`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`)
  }
  return `${html}${footer}`
}

export async function isUnsubscribed(
  db: SupabaseClient,
  accountId: string,
  email: string,
): Promise<boolean> {
  const { data } = await db
    .from('email_unsubscribes')
    .select('id')
    .eq('account_id', accountId)
    .ilike('email', email)
    .maybeSingle()
  return Boolean(data)
}
