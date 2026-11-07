import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { commentMonitorQueue } from '@/lib/queues'
import { tickScopedJobId } from '@/lib/job-id'

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Capped like every sibling cron (publish-due-posts: 500, sync-metrics: 200)
  // -- this was the one cron in the fleet with an uncapped, platform-wide
  // query and an unbounded Promise.all fan-out of BullMQ .add() calls.
  const accounts = await prisma.socialAccount.findMany({
    where: {
      isActive: true,
      workspace: { aiResponseMode: { not: 'OFF' } },
    },
    select: { id: true },
    take: 500,
  })

  await Promise.all(
    accounts.map(a =>
      // Tick-scoped jobId so BullMQ's dedup still collapses two ticks inside
      // the same window, without the id being occupied forever. A permanently
      // stable `monitor-${a.id}` was a one-way door: this queue retains
      // failures (removeOnFail: { count: 100 }), BullMQ no-ops add() for an id
      // that exists in ANY state, so the first tick to exhaust its attempts
      // killed comment ingestion outright -- while this route kept answering
      // 200 with { queued: N } because add() itself still succeeded. Nothing
      // synced between 24 Aug and 7 Nov 2026 for exactly this reason.
      commentMonitorQueue.add(
        'monitor-account',
        { socialAccountId: a.id },
        { jobId: tickScopedJobId(`monitor-${a.id}`), removeOnComplete: true }
      )
    )
  )

  return NextResponse.json({ queued: accounts.length })
}
