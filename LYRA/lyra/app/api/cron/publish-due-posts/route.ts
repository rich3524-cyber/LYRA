import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postQueue } from '@/services/scheduler/post-queue'

// Jobs use a stable `post-${postId}` jobId so repeated cron ticks don't queue
// the same due post twice while a job is still in flight. BullMQ's add()
// silently no-ops when a job with that id already exists though -- including
// when it's sitting in the completed or failed set (e.g. a post skipped
// during a workspace crisis, see workers/post-publisher.worker.ts). Without
// clearing that stale terminal job first, a post that missed its window would
// never get a fresh attempt: every future cron tick would try to re-add under
// the same id and silently do nothing.
async function enqueuePublish(postId: string) {
  const jobId = `post-${postId}`
  const existing = await postQueue.getJob(jobId)
  if (existing) {
    const state = await existing.getState()
    if (state === 'completed' || state === 'failed') {
      await existing.remove()
    } else {
      return // already queued or in flight -- don't double-enqueue
    }
  }
  await postQueue.add('publish-post', { postId }, { jobId })
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
      // Safety cap -- without this, a backlog (e.g. after downtime) could pull an
      // unbounded number of rows into memory and enqueue them all in one tick.
      // Any leftover due posts are picked up on the next cron run.
      take: 500,
    })

    await Promise.all(duePosts.map((p) => enqueuePublish(p.id)))

    return NextResponse.json({ queued: duePosts.length })
  } catch (error) {
    console.error('GET /api/cron/publish-due-posts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
