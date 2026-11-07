import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { getAuthUrl } from '@/services/seo/gsc-client'

export const dynamic = 'force-dynamic'


export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    // workspaceId comes straight off the query string and is signed into the
    // OAuth state that /api/seo/callback later trusts as its upsert target, so
    // authorize it here rather than sending the user to Google's consent screen
    // for a workspace they can't write to. The callback repeats this check --
    // it's reachable by URL without ever passing through this route -- but
    // failing here means the user never reaches Google at all, and never grants
    // a scope that would only be discarded.
    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.redirect(getAuthUrl(workspaceId))
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/seo/connect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
