import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://graph.facebook.com/v19.0'

export async function POST(_req: Request) {
  try {
    await requireAuth()

    const account = await prisma.socialAccount.findFirst({
      where: { platform: 'INSTAGRAM', isActive: true },
    })
    if (!account) return NextResponse.json({ error: 'No Instagram account connected' }, { status: 404 })
    if (!account.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    const accessToken = decrypt(account.accessToken)
    const igId = account.platformId

    // Step 1 — create media container
    const createRes = await fetch(`${BASE_URL}/${igId}/media`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        image_url:    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080',
        caption:      'LYRA publishes to Instagram automatically, in your brand voice.',
        access_token: accessToken,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const createData = await createRes.json() as { id?: string; error?: { message: string } }
    if (!createRes.ok || createData.error) {
      throw new Error(createData.error?.message ?? `Container creation failed: ${createRes.status}`)
    }

    const creationId = createData.id!

    // Step 2 — publish container
    const publishRes = await fetch(`${BASE_URL}/${igId}/media_publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creation_id: creationId, access_token: accessToken }),
      signal:  AbortSignal.timeout(15_000),
    })
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } }
    if (!publishRes.ok || publishData.error) {
      throw new Error(publishData.error?.message ?? `Publish failed: ${publishRes.status}`)
    }

    return NextResponse.json({ ok: true, mediaId: publishData.id })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
