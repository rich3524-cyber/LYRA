import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DIRECT_URL_set: !!process.env.DIRECT_URL,
    DATABASE_URL_prefix: process.env.DATABASE_URL?.substring(0, 30),
    DIRECT_URL_prefix: process.env.DIRECT_URL?.substring(0, 30),
  }

  try {
    const count = await prisma.user.count()
    results.prisma = 'ok'
    results.user_count = count
  } catch (err) {
    results.prisma = 'error'
    results.prisma_error = err instanceof Error ? err.message : String(err)
    results.prisma_stack = err instanceof Error ? err.stack?.split('\n').slice(0, 5).join('\n') : undefined
  }

  return NextResponse.json(results)
}
