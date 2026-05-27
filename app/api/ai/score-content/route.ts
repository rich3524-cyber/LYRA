import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scoreContent } from '@/services/ai/content-scorer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json().catch(() => null)
    const content = body?.content
    const platform = body?.platform
    const workspaceId = body?.workspaceId

    if (typeof workspaceId !== 'string' || typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (content.length < 10) {
      return NextResponse.json({ error: 'Content too short to score.' }, { status: 422 })
    }

    const result = await scoreContent(content, typeof platform === 'string' ? platform : 'INSTAGRAM')
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Content scoring error:', error)
    return NextResponse.json({ error: 'Scoring unavailable' }, { status: 503 })
  }
}
