import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { commentMonitorQueue } from '@/lib/queues'

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
      // Stable jobId (no timestamp) so BullMQ's own dedup applies: if a monitor
      // job for this account is still waiting/active from a previous tick, this
      // add() is a no-op instead of stacking a second overlapping run.
      commentMonitorQueue.add(
        'monitor-account',
        { socialAccountId: a.id },
        { jobId: `monitor-${a.id}`, removeOnComplete: true }
      )
    )
  )

  return NextResponse.json({ queued: accounts.length })
}
