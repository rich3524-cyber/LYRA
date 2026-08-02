import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    // Fetch and authorize in one scoped query so there's never an unscoped
    // integration object in scope that a future edit could deactivate before
    // an access check runs. The fallback lookup below only decides which
    // error to return -- it plays no role in authorizing the update.
    const integration = await prisma.emailIntegration.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
      select: { id: true },
    })
    if (!integration) {
      const exists = await prisma.emailIntegration.findUnique({ where: { id }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }

    await prisma.emailIntegration.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/email-integrations/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
