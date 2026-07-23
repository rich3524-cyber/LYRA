import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { CrisisKeywordSuggestionState } from '@/services/brand-intelligence/crisis-keyword-suggester'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, keyword } = await req.json() as { workspaceId?: string; keyword?: string }

    if (!workspaceId || !keyword?.trim()) {
      return NextResponse.json({ error: 'workspaceId and keyword required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const profile = await prisma.brandProfile.findUnique({
      where:  { workspaceId },
      select: { suggestedCrisisKeywords: true },
    })
    if (!profile?.suggestedCrisisKeywords) {
      return NextResponse.json({ ok: true })
    }

    const trimmed     = keyword.trim().toLowerCase()
    const suggestions = profile.suggestedCrisisKeywords as unknown as CrisisKeywordSuggestionState[]
    let changed        = false
    const updated      = suggestions.map((s) => {
      if (s.keyword.toLowerCase() === trimmed && !s.dismissed) {
        changed = true
        return { ...s, dismissed: true }
      }
      return s
    })

    if (changed) {
      await prisma.brandProfile.update({
        where: { workspaceId },
        data:  { suggestedCrisisKeywords: JSON.parse(JSON.stringify(updated)) },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/crisis-keywords/dismiss error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
