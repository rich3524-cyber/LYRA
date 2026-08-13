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

    // Fetch and authorize in one scoped query so there's never an unscoped
    // post object in scope that a future edit could publish before an
    // access check runs. The fallback lookup below only decides which error
    // to return -- it plays no role in authorizing the publish.
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
      include: { socialAccount: true },
    })
    if (!post) {
      const exists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Post not found' }, { status: exists ? 403 : 404 })
    }

    // Atomic compare-and-swap, matching workers/post-publisher.worker.ts's own
    // SCHEDULED->PUBLISHING claim -- without this, a plain read-check here
    // races the cron: a SCHEDULED post whose time has just passed can be
    // picked up by the worker AND have "Publish now" clicked in the same
    // window, and both would pass a status check that ran before either
    // claimed the row, calling the provider twice for the same post.
    const claimed = await prisma.post.updateMany({
      where: { id: postId, status: { notIn: ['PUBLISHED', 'PUBLISHING'] } },
      data:  { status: 'PUBLISHING' },
    })
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Post already published or currently publishing.' }, { status: 400 })
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

    let platformPostId: string
    let zernioPostId: string | undefined
    try {
      ;({ platformPostId, zernioPostId } = await getProvider(post.socialAccount).publish(post.socialAccount, {
        postId: post.id,
        content: post.content,
        mediaUrls: post.mediaUrls,
      }))
    } catch (sendError) {
      // The claim above already flipped this post to PUBLISHING before we
      // knew whether the platform call would succeed -- revert to whatever
      // it was before this request's own claim (own-claim-scoped, so a
      // concurrent write in between is never clobbered) rather than leaving
      // it permanently stranded in PUBLISHING with no reconciler to pick it
      // back up.
      await prisma.post.updateMany({
        where: { id: postId, status: 'PUBLISHING' },
        data:  { status: post.status },
      })
      throw sendError
    }

    await prisma.post.updateMany({
      where: { id: postId, status: 'PUBLISHING' },
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
    return NextResponse.json({ error: 'Failed to publish post' }, { status: 502 })
  }
}
