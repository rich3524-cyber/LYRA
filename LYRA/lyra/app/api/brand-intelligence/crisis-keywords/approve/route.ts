import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import type { CrisisKeywordSuggestionState } from '@/services/brand-intelligence/crisis-keyword-suggester'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, keyword, category } = await req.json() as {
      workspaceId?: string
      keyword?:     string
      category?:    string
    }

    if (!workspaceId || !keyword?.trim()) {
      return NextResponse.json({ error: 'workspaceId and keyword required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access || !canWrite(access.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const trimmed = keyword.trim().toLowerCase()

    // Duplicate approve (already an active guardrail) is a no-op success, not
    // an error -- avoids a confusing failure on a double-click or re-adding
    // something already active. Atomic upsert keyed on the unique constraint
    // closes the find-then-create race (two near-simultaneous approves for
    // the same new keyword). Keyword is normalized to lowercase above, so the
    // case-sensitive unique constraint still yields case-insensitive dedup in
    // practice (e.g. "Lawsuit" and "lawsuit" both normalize to "lawsuit" and
    // hit the same row) -- consistent with every other dedup check in this
    // feature (crisis-detector.ts, mergeCrisisKeywordSuggestions, and the
    // suggestion-list filter below).
    const guardrail = await prisma.guardrail.upsert({
      where: {
        workspaceId_type_value: { workspaceId, type: 'ALWAYS_ESCALATE', value: trimmed },
      },
      create: { workspaceId, type: 'ALWAYS_ESCALATE', value: trimmed },
      update: {},
    })

    const profile = await prisma.brandProfile.findUnique({
      where:  { workspaceId },
      select: { suggestedCrisisKeywords: true },
    })
    if (profile?.suggestedCrisisKeywords) {
      const suggestions = profile.suggestedCrisisKeywords as unknown as CrisisKeywordSuggestionState[]
      const filtered     = suggestions.filter((s) => s.keyword.toLowerCase() !== trimmed.toLowerCase())
      if (filtered.length !== suggestions.length) {
        await prisma.brandProfile.update({
          where: { workspaceId },
          data:  { suggestedCrisisKeywords: JSON.parse(JSON.stringify(filtered)) },
        })
      }
    }

    return NextResponse.json(guardrail)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/crisis-keywords/approve error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
