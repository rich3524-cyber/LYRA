import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCaption } from '@/services/ai/caption-generator'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'


export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`ai-generate:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, platforms, topic } = await req.json()

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const brandProfile = await prisma.brandProfile.findUnique({ where: { workspaceId } })
    if (!brandProfile) {
      return NextResponse.json(
        { error: 'Brand profile not found. Build brand intelligence first.' },
        { status: 404 }
      )
    }

    const content = await generateCaption(brandProfile, platforms ?? [], topic)
    return NextResponse.json({ content })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/ai/generate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
