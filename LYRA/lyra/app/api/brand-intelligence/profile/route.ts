import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [profile, guardrails] = await Promise.all([
      prisma.brandProfile.findUnique({
        where: { workspaceId },
        select: { voiceSummary: true, toneAttributes: true, contentThemes: true },
      }),
      prisma.guardrail.findMany({
        where: { workspaceId },
        select: { type: true, value: true },
      }),
    ])

    return NextResponse.json({
      voiceSummary: profile?.voiceSummary ?? null,
      toneAttributes: profile?.toneAttributes ?? [],
      contentThemes: profile?.contentThemes ?? [],
      guardrails,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/brand-intelligence/profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
