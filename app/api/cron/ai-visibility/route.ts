import { checkCronAuth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { aiVisibilityQueue } from '@/workers/ai-visibility.worker'

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobId = `ai-visibility-${new Date().toISOString().slice(0, 10)}`

  await aiVisibilityQueue.add(
    'daily-snapshot',
    {},
    { jobId, removeOnComplete: true }
  )

  return NextResponse.json({ queued: true, jobId })
}
