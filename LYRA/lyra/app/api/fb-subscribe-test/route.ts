import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'

export const dynamic = 'force-dynamic'

const BASE = 'https://graph.facebook.com/v19.0'

export async function POST(_req: Request) {
  try {
    await requireAuth()

    const account = await prisma.socialAccount.findFirst({
      where: { platform: 'FACEBOOK', isActive: true },
    })
    if (!account) return NextResponse.json({ error: 'No Facebook account' }, { status: 404 })

    const token = decrypt(account.accessToken)
    const pageId = account.platformId

    const res = await fetch(
      `${BASE}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(10_000) }
    )
    const text = await res.text()
    let data: { data?: unknown[]; error?: { message: string } } = {}
    try { data = JSON.parse(text) } catch { /* non-JSON response */ }
    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error?.message ?? text ?? `Error: ${res.status}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true, pageId, subscriptions: data.data ?? [] })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 502 })
  }
}
