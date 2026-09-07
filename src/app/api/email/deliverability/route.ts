import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { checkDeliverability } from '@/lib/email/deliverability'

export async function GET(request: Request) {
  try {
    await getCurrentAccount()
    const url = new URL(request.url)
    const domain = url.searchParams.get('domain')?.trim()
    if (!domain) return NextResponse.json({ error: 'domain es requerido' }, { status: 400 })

    const selector = url.searchParams.get('selector')?.trim()
    const report = await checkDeliverability(domain, selector ? [selector] : [])
    return NextResponse.json({ report })
  } catch (err) {
    return toErrorResponse(err)
  }
}
