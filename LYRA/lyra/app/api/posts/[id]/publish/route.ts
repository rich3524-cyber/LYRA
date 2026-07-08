import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { publishPost } from '@/services/social/facebook'

export const dynamic = 'force-dynamic'

const IG_BASE = 'https://graph.facebook.com/v19.0'

async function publishToInstagram(igId: string, content: string, accessToken: string): Promise<string> {
  const createRes = await fetch(`${IG_BASE}/${igId}/media`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      image_url:    'https://picsum.photos/1080/1080.jpg',
      caption:      content,
      access_token: accessToken,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const createData = await createRes.json() as { id?: string; error?: { message: string } }
  if (!createRes.ok || createData.error) throw new Error(createData.error?.message ?? `IG container error: ${createRes.status}`)

  const publishRes = await fetch(`${IG_BASE}/${igId}/media_publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ creation_id: createData.id, access_token: accessToken }),
    signal:  AbortSignal.timeout(15_000),
  })
  const publishData = await publishRes.json() as { id?: string; error?: { message: string } }
  if (!publishRes.ok || publishData.error) throw new Error(publishData.error?.message ?? `IG publish error: ${publishRes.status}`)
  return publishData.id!
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: postId } = await params

    const post = await prisma.post.findUnique({
      where:   { id: postId },
      include: { socialAccount: true },
    })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: post.workspaceId, userId: user.id },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (post.status === 'PUBLISHED') {
      return NextResponse.json({ error: 'Post already published.' }, { status: 400 })
    }

    const platform = post.socialAccount.platform
    if (platform !== 'FACEBOOK' && platform !== 'INSTAGRAM') {
      return NextResponse.json({ error: 'Direct publish only supported for Facebook and Instagram.' }, { status: 400 })
    }

    if (!post.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }
    const accessToken = decrypt(post.socialAccount.accessToken)
    const platformPostId = platform === 'INSTAGRAM'
      ? await publishToInstagram(post.socialAccount.platformId, post.content, accessToken)
      : await publishPost(post.socialAccount.platformId, post.content, accessToken)

    await prisma.post.update({
      where: { id: postId },
      data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId },
    })

    return NextResponse.json({ ok: true, platformPostId })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/posts/[id]/publish error:', error)
    const message = error instanceof Error ? error.message : 'Failed to publish post'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
