import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'


export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()

    // Fetch and authorize in one scoped query so there's never an unscoped
    // comment object in scope that a future edit could mutate before an
    // access check runs. The fallback lookup below only decides which error
    // to return -- it plays no role in authorizing the update.
    const comment = await prisma.comment.findFirst({
      where: {
        id,
        socialAccount: { workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } } },
      },
    })
    if (!comment) {
      const exists = await prisma.comment.findUnique({ where: { id }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }

    const allowed = ['status', 'aiDraftResponse', 'finalResponse', 'respondedAt', 'isEscalated', 'escalationReason'] as const
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    const updated = await prisma.comment.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PATCH /api/comments/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
