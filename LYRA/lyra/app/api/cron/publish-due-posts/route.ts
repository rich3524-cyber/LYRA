import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postQueue } from '@/services/scheduler/post-queue'

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
      // Safety cap -- without this, a backlog (e.g. after downtime) could pull an
      // unbounded number of rows into memory and enqueue them all in one tick.
      // Any leftover due posts are picked up on the next cron run.
      take: 500,
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
