import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { analyzePage } from '@/services/seo/on-page-analyzer'

export async function POST(
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

    const analysis = await analyzePage(page.url)

    const updated = await prisma.seoPage.update({
      where: { id: pageId },
      data: { seoScore: analysis.seoScore, lastAnalysedAt: new Date() },
      include: { content: { orderBy: { createdAt: 'desc' } } },
    })

    return NextResponse.json({
      ...updated,
      scoreBreakdown: analysis.scoreBreakdown,
      currentTitle: analysis.title,
      currentMeta: analysis.metaDescription,
      currentH1: analysis.h1,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/seo/pages/[pageId]/analyze error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
