import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'

export const dynamic = 'force-dynamic'

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

    // Restored from the pre-provider-seam version of this route: a clear 400
    // before attempting anything, rather than letting a missing token surface
    // as a generic 502 from deep inside nativeProvider (which also shouldn't
    // leak the account's internal id into a client-facing error message).
    // Condition mirrors getProvider's dispatch (services/social/provider/index.ts):
    // an account only resolves to zernioProvider when provider === 'ZERNIO' AND
    // zernioAccountId is set; everything else resolves to nativeProvider and
    // therefore requires accessToken.
    const resolvesToZernio =
      post.socialAccount.provider === 'ZERNIO' && post.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !post.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    const { platformPostId, zernioPostId } = await getProvider(post.socialAccount).publish(post.socialAccount, {
      content: post.content,
      mediaUrls: post.mediaUrls,
    })

    await prisma.post.update({
      where: { id: postId },
      data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId, zernioPostId },
    })

    return NextResponse.json({ ok: true, platformPostId })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ProviderUnsupported) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/posts/[id]/publish error:', error)
    const message = error instanceof Error ? error.message : 'Failed to publish post'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
