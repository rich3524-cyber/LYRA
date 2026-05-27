import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const competitor = await prisma.competitor.findFirst({
      where: { id },
      include: { workspace: { include: { access: true } } },
    })
    if (!competitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasAccess = competitor.workspace.access.some((a) => a.userId === user.id)
    if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.competitor.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[competitors] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
