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
    if (!account.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    const token = decrypt(account.accessToken)
    const igId = account.platformId
    const results: Record<string, unknown> = {}

    // instagram_basic — read account profile
    const basicRes = await fetch(
      `${BASE}/${igId}?fields=id,name,username,biography,followers_count&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(10_000) }
    )
    const basicData = await basicRes.json() as { id?: string; username?: string; error?: { message: string } }
    results.basic = basicData.error ? { error: basicData.error.message } : { id: basicData.id, username: basicData.username }

    // instagram_manage_comments — read comments on recent media
    const mediaRes = await fetch(
      `${BASE}/${igId}/media?fields=id,comments{text,username,timestamp}&limit=5&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(10_000) }
    )
    const mediaData = await mediaRes.json() as { data?: Array<{ id: string; comments?: { data?: unknown[] } }>; error?: { message: string } }
    results.comments = mediaData.error ? { error: mediaData.error.message } : { mediaCount: mediaData.data?.length ?? 0 }

    // instagram_content_publish — two-step publish
    const containerRes = await fetch(`${BASE}/${igId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        image_url: 'https://picsum.photos/1080/1080.jpg',
        caption: 'LYRA publishes to Instagram automatically, in your brand voice.',
        access_token: token,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    })
    const containerData = await containerRes.json() as { id?: string; error?: { message: string } }
    if (containerData.error) {
      results.publish = { error: containerData.error.message }
    } else {
      const publishRes = await fetch(`${BASE}/${igId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ creation_id: containerData.id!, access_token: token }).toString(),
        signal: AbortSignal.timeout(15_000),
      })
      const publishData = await publishRes.json() as { id?: string; error?: { message: string } }
      results.publish = publishData.error ? { error: publishData.error.message } : { mediaId: publishData.id }
    }

    return NextResponse.json({ ok: true, igId, results })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 502 })
  }
}
