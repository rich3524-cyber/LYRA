import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { syncWorkspaceComments } from '@/services/comments/sync'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    // Fans out an external API call per connected account -- unbounded by
    // account count, so this needs a real ceiling rather than none at all.
    const { allowed } = await checkRateLimit(`comments-sync:${user.id}`, 10, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId } = await req.json() as { workspaceId: string }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      select: { id: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newCount = await syncWorkspaceComments(workspaceId)

    return NextResponse.json({ synced: newCount })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/comments/sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
