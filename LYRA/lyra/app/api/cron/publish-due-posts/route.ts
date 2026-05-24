import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { postQueue } from '@/services/scheduler/post-queue'

function checkCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (auth.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
}

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const duePosts = await prisma.post.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { not: null, lte: new Date() },
      },
      select: { id: true },
    })

    await Promise.all(
      duePosts.map((p) =>
        postQueue.add(
          'publish-post',
          { postId: p.id },
          { jobId: `post-${p.id}` }
        )
      )
    )

    return NextResponse.json({ queued: duePosts.length })
  } catch (error) {
    console.error('GET /api/cron/publish-due-posts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
