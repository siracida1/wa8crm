// Open/click tracking for the Email Marketing module. Both send paths
// (the campaign wizard's send-one route and the automations engine's
// send_email step) insert a 'pending' email_campaign_logs row BEFORE
// sending, wrap the HTML with this module using that row's id, then
// send and flip the row to 'sent'/'failed'. See migration 048.

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
  'base64',
)

export function transparentGif(): Buffer {
  return TRANSPARENT_GIF
}

// Mirrors the NEXT_PUBLIC_SITE_URL resolution used for invite links
// (src/app/api/account/invitations/route.ts), simplified for a context
// with no incoming Request (the automations engine can run from the
// cron-resumed wait path, with no HTTP request at all).
export function resolveTrackingBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit && !explicit.includes('example.com')) {
    return explicit.replace(/\/+$/, '')
  }
  return 'http://localhost:3210'
}

const HREF_RE = /href=(["'])(https?:\/\/[^"']+)\1/gi

/**
 * Embeds a 1x1 tracking pixel and rewrites every http(s) link to route
 * through the click-tracking redirect. Leaves mailto:, tel:, and
 * relative/anchor links untouched — those aren't meaningful "clicks"
 * and rewriting mailto: would break it.
 */
export function wrapHtmlForTracking(html: string, sendId: string): string {
  const base = resolveTrackingBaseUrl()

  const withTrackedLinks = html.replace(HREF_RE, (_match, quote, url) => {
    const tracked = `${base}/api/email/track/click/${sendId}?u=${encodeURIComponent(url)}`
    return `href=${quote}${tracked}${quote}`
  })

  const pixel = `<img src="${base}/api/email/track/open/${sendId}" width="1" height="1" alt="" style="display:none" />`
  if (/<\/body>/i.test(withTrackedLinks)) {
    return withTrackedLinks.replace(/<\/body>/i, `${pixel}</body>`)
  }
  return `${withTrackedLinks}${pixel}`
}
