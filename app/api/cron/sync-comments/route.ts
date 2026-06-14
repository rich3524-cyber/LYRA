import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'

const commentQueue = new Queue('comment-monitoring', { connection: redis })

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
