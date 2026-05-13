import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'

const commentQueue = new Queue('comment-monitoring', { connection: redis })

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
      commentQueue.add(
        'monitor-account',
        { socialAccountId: a.id },
        { jobId: `monitor-${a.id}-${Date.now()}`, removeOnComplete: true }
      )
    )
  )

  return NextResponse.json({ queued: accounts.length })
}
