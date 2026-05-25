import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { crisisActive: true, crisisTriggeredAt: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      crisisActive: workspace.crisisActive,
      crisisTriggeredAt: workspace.crisisTriggeredAt?.toISOString() ?? null,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Crisis status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
