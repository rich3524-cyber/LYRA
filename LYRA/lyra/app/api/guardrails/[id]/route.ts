import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const guardrail = await prisma.guardrail.findUnique({ where: { id } })
    if (!guardrail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId: guardrail.workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
