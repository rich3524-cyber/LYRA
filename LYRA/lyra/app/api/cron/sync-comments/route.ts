import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'

const commentQueue = new Queue('comment-monitoring', { connection: redis })

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await prisma.socialAccount.findMany({
    where: {
      isActive: true,
      workspace: { aiResponseMode: { not: 'OFF' } },
    },
    select: { id: true },
  })

  await Promise.all(
    accounts.map(a =>
      // Stable jobId (no timestamp) so BullMQ's own dedup applies: if a monitor
      // job for this account is still waiting/active from a previous tick, this
      // add() is a no-op instead of stacking a second overlapping run.
      commentQueue.add(
        'monitor-account',
        { socialAccountId: a.id },
        { jobId: `monitor-${a.id}`, removeOnComplete: true }
      )
    )
  )

  return NextResponse.json({ queued: accounts.length })
}
