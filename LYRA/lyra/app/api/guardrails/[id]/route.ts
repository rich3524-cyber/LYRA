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

    await prisma.guardrail.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/guardrails/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
