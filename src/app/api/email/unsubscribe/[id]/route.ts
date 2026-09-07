import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// Public, unauthenticated — a human clicks this link from their own
// mail client, so it renders an HTML confirmation page, not JSON.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const admin = supabaseAdmin()

  const { data: log } = await admin
    .from('email_campaign_logs')
    .select('account_id, recipient')
    .eq('id', id)
    .maybeSingle()

  const page = (message: string) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Baja de emails</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222}</style>
</head><body><h1>Zittex</h1><p>${message}</p></body></html>`

  if (!log) {
    return new NextResponse(page('No pudimos procesar la baja — el enlace no es válido.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const { error } = await admin
    .from('email_unsubscribes')
    .upsert(
      { account_id: log.account_id, email: log.recipient.toLowerCase() },
      { onConflict: 'account_id,email', ignoreDuplicates: true },
    )

  if (error) {
    console.error('[email/unsubscribe] failed:', error)
    return new NextResponse(page('No pudimos procesar la baja. Intentá de nuevo más tarde.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new NextResponse(
    page(`<strong>${log.recipient}</strong> fue dado de baja correctamente. No vas a recibir más emails nuestros.`),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
