import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth()
    const { pageId } = await params

    const page = await prisma.seoPage.findFirst({
      where: {
        id: pageId,
        workspace: { access: { some: { userId: user.id } } },
      },
    })
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.seoPage.delete({ where: { id: pageId } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/seo/pages/[pageId] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
