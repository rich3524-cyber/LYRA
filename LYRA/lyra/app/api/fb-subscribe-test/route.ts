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

    const res = await fetch(`${BASE}/${pageId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: ['feed', 'comments'],
        access_token: token,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json() as { success?: boolean; error?: { message: string } }
    if (!res.ok || data.error) throw new Error(data.error?.message ?? `Subscribe error: ${res.status}`)

    return NextResponse.json({ ok: true, pageId, subscribed: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 502 })
  }
}
