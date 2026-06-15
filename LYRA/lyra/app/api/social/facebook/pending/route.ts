import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const pendingKey = searchParams.get('key')

    if (!pendingKey) {
      return NextResponse.json({ error: 'key required' }, { status: 400 })
    }

    const pending = await prisma.facebookPending.findUnique({ where: { key: pendingKey } })
    if (!pending || pending.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Pending session expired. Please reconnect Facebook.' }, { status: 404 })
    }

    // Verify the requesting user has access to the workspace in the pending data
    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: pending.workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = pending.data as { adAccountId: string | null; pages: Array<{ id: string; name: string; avatarUrl: string | null; encryptedToken: string }> }

    // Return display data only — never expose tokens
    return NextResponse.json({
      workspaceId: pending.workspaceId,
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
