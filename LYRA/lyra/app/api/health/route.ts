import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisClient } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// Unauthenticated by design (this is what an uptime monitor hits) -- returns
// only up/down status, no data. Covers the Netlify app's DB/Redis
// connectivity; the Railway worker fleet has no HTTP server to expose an
// equivalent check on (it's a background BullMQ consumer process, not a web
// service) -- that would need a small dedicated HTTP listener added to
// workers/index.ts, out of scope here. Previously there was no way to know
// either was degraded except a customer reporting it.
export async function GET() {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redisClient.ping().then(() => true).catch(() => false),
  ])

  const healthy = dbOk && redisOk
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', database: dbOk, redis: redisOk },
    { status: healthy ? 200 : 503 }
  )
}
