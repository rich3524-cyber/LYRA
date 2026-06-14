import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { redisClient } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

    const raw = await redisClient.get(`fb_pending:${key}`)
    if (!raw) return NextResponse.json({ error: 'Session expired. Please reconnect Facebook.' }, { status: 404 })

    const data = JSON.parse(raw) as { pages: { id: string; name: string; avatarUrl: string | null }[] }
    const pages = (data.pages ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
    }))

    return NextResponse.json({ pages })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/social/facebook/pages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
