import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    // Fetch and authorize in one scoped query so there's never an unscoped
    // guardrail object in scope that a future edit could delete before an
    // access check runs. The fallback lookup below only decides which error
    // to return -- it plays no role in authorizing the delete.
    const guardrail = await prisma.guardrail.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
    })
    if (!guardrail) {
      const exists = await prisma.guardrail.findUnique({ where: { id }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }

    try {
      await prisma.guardrail.delete({ where: { id } })
    } catch (deleteError) {
      // P2025 = record not found -- a concurrent delete (double-click, race)
      // already removed it. The end state the caller wanted is achieved
      // either way, so this is a success, not an error.
      const code = (deleteError as { code?: string } | null)?.code
      if (code !== 'P2025') throw deleteError
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/guardrails/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
