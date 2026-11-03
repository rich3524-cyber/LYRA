export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { analyzeEngagement } from '@/services/ai/engagement-analyzer'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    // This route reaches Claude via analyzeEngagement, so without a limit it
    // was an unmetered, billable AI endpoint -- every sibling route that calls
    // the model (ai/generate, ai/respond, ai/score-content, ...) already caps
    // at 20/60s per user, and this one was simply missed. Control 21 of the
    // ITWM security framework requires per-user rate limits on AI features;
    // the same limit is used here so the ceiling is consistent across every
    // model-calling endpoint rather than route-by-route guesswork.
    const { allowed } = await checkRateLimit(`brand-analyze-engagement:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId } = await req.json() as { workspaceId: string }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      select: { id: true, brandProfile: { select: { id: true, postingPatterns: true } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    if (!workspace.brandProfile) {
      return NextResponse.json({ error: 'Brand profile required' }, { status: 400 })
    }

    const { patterns, postCounts } = await analyzeEngagement(workspaceId)

    if (patterns !== null) {
      const existing = (workspace.brandProfile.postingPatterns as Record<string, unknown>) ?? {}
      await prisma.brandProfile.update({
        where: { workspaceId },
        data: { postingPatterns: { ...existing, ...patterns } as Prisma.InputJsonValue },
      })
    }

    return NextResponse.json({ postingPatterns: patterns, postCounts })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/analyze-engagement error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
