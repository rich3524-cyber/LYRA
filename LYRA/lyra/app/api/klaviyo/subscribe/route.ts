import { NextResponse } from 'next/server'
import { subscribeEmail } from '@/lib/klaviyo'

export async function POST(req: Request) {
  try {
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
