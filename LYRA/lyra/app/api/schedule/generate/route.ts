export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateWeekPosts } from '@/services/ai/schedule-generator'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    // Fans out one Claude call per platform per week -- more expensive than
    // the single-call AI routes (20/min), so this gets a lower ceiling.
    const { allowed } = await checkRateLimit(`schedule-generate:${user.id}`, 10, 60)
    if (!allowed) return rateLimitResponse()

    const body = await req.json() as {
      workspaceId: string
      weekNumber: number
      weekStartDate: string
      platform: string
      count: number
    }
    const { workspaceId, weekNumber, weekStartDate, platform, count } = body

    if (!workspaceId || !weekNumber || !weekStartDate || !platform || !count) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 7) {
      return NextResponse.json(
        { error: 'Post count must be an integer between 1 and 7' },
        { status: 400 }
      )
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      include: {
        brandProfile: {
          select: {
            voiceSummary: true,
            toneAttributes: true,
            contentThemes: true,
            audienceProfile: true,
            postingPatterns: true,
          },
        },
      },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    if (!workspace.brandProfile) {
      return NextResponse.json({ error: 'Brand profile required' }, { status: 400 })
    }

    const brand = {
      voiceSummary:   workspace.brandProfile.voiceSummary,
      toneAttributes: workspace.brandProfile.toneAttributes,
      contentThemes:  workspace.brandProfile.contentThemes,
      audienceProfile: workspace.brandProfile.audienceProfile,
    }

    const rawPatterns = workspace.brandProfile.postingPatterns as Record<string, unknown> | null
    const postingPatterns: PostingPatterns = {}
    if (rawPatterns) {
      for (const [key, val] of Object.entries(rawPatterns)) {
        if (key !== 'guidelines' && typeof val === 'object' && val !== null && 'topSlots' in val) {
          postingPatterns[key] = val as PostingPatterns[string]
        }
      }
    }

    const posts = await generateWeekPosts(
      brand,
      weekNumber,
      new Date(weekStartDate),
      platform,
      count,
      Object.keys(postingPatterns).length > 0 ? postingPatterns : undefined,
    )

    return NextResponse.json({ posts })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/schedule/generate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
