import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redisClient } from '@/lib/redis'

export const dynamic = 'force-dynamic'

interface PendingPage {
  id: string
  name: string
  avatarUrl: string | null
  encryptedToken: string
}

interface PendingData {
  workspaceId: string
  adAccountId: string | null
  pages: PendingPage[]
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const pendingKey = searchParams.get('key')

    if (!pendingKey) {
      return NextResponse.json({ error: 'key required' }, { status: 400 })
    }

    const raw = await redisClient.get(`fb_pending:${pendingKey}`)
    if (!raw) {
      return NextResponse.json({ error: 'Pending session expired or not found' }, { status: 404 })
    }

    const data: PendingData = JSON.parse(raw)

    // Verify the requesting user has access to the workspace in the pending data
    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: data.workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Return display data only — never expose tokens
    return NextResponse.json({
      workspaceId: data.workspaceId,
      pages: data.pages.map((p) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/social/facebook/pending error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
