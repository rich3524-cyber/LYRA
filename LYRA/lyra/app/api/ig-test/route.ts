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
      where: { platform: 'INSTAGRAM', isActive: true },
    })
    if (!account) return NextResponse.json({ error: 'No Instagram account' }, { status: 404 })

    const token = decrypt(account.accessToken)
    const igId  = account.platformId

    const c = await fetch(`${BASE}/${igId}/media`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_url: 'https://picsum.photos/1080/1080.jpg', caption: 'LYRA publishes to Instagram automatically.', access_token: token }),
      signal:  AbortSignal.timeout(20_000),
    })
    const cd = await c.json() as { id?: string; error?: { message: string } }
    if (!c.ok || cd.error) throw new Error(cd.error?.message ?? `container: ${c.status}`)

    const p = await fetch(`${BASE}/${igId}/media_publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creation_id: cd.id, access_token: token }),
      signal:  AbortSignal.timeout(20_000),
    })
    const pd = await p.json() as { id?: string; error?: { message: string } }
    if (!p.ok || pd.error) throw new Error(pd.error?.message ?? `publish: ${p.status}`)

    return NextResponse.json({ ok: true, mediaId: pd.id })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 502 })
  }
}
