import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { syncAllEmailCampaigns } from '@/services/email/sync'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.replace('Bearer ', '')

  try {
    const a = Buffer.from(token)
    const b = Buffer.from(secret)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const synced = await syncAllEmailCampaigns()
    return NextResponse.json({ synced })
  } catch (error) {
    console.error('[cron/sync-email] error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
