import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from '@/i18n/locales'

// Sets the user's language preference. No auth required — this only
// controls which message catalogue the RSC tree renders with, not any
// account data. One year cookie so the choice survives across sessions.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const locale = typeof body?.locale === 'string' ? body.locale : ''

  if (!SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])) {
    return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 })
  }

  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  return NextResponse.json({ locale })
}
