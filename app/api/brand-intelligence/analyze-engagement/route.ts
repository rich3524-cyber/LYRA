export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { analyzeEngagement } from '@/services/ai/engagement-analyzer'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json() as { workspaceId: string }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, brandProfile: { select: { id: true } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    if (!workspace.brandProfile) {
      return NextResponse.json({ error: 'Brand profile required' }, { status: 400 })
    }

    const result = await analyzeEngagement(workspaceId)

    if (result !== null) {
      await prisma.brandProfile.update({
        where: { workspaceId },
        data: { postingPatterns: result as unknown as Prisma.InputJsonValue },
      })
    }

    return NextResponse.json({ postingPatterns: result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/analyze-engagement error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
