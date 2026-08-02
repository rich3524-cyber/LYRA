import { NextResponse } from 'next/server'
import { subscribeEmail } from '@/lib/klaviyo'
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    // Unauthenticated newsletter signup form -- cap per-IP to stop it being used
    // to spam Klaviyo with subscribe requests (list-poisoning / cost abuse).
    const { allowed } = await checkRateLimit(`klaviyo-subscribe:${getClientIp(req)}`, 5, 600)
    if (!allowed) return rateLimitResponse()

    const { email } = await req.json() as { email?: string }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    await subscribeEmail(email)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[subscribe route]', error)
    return NextResponse.json({ error: 'Subscription failed' }, { status: 500 })
  }
}
