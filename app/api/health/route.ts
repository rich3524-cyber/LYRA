import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkCronAuth } from '@/lib/auth'

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let dbStatus = 'unknown'
  try {
    await prisma.$queryRaw`SELECT 1`
    dbStatus = 'ok'
  } catch {
    dbStatus = 'error'
  }

  return NextResponse.json({ status: dbStatus === 'ok' ? 'ok' : 'degraded', db: dbStatus })
}
