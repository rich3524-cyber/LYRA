import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { analyzePage } from '@/services/seo/on-page-analyzer'
import { generateSeoContent } from '@/services/seo/content-generator'
import type { SeoContentType } from '@prisma/client'

export const dynamic = 'force-dynamic'


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
      include: {
        workspace: { include: { brandProfile: true } },
      },
    })
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const analysis = await analyzePage(page.url)
    const generated = await generateSeoContent(analysis, page.workspace.brandProfile)

    const contentMap: Record<SeoContentType, string> = {
      META_TITLE: generated.metaTitle,
      META_DESC: generated.metaDescription,
      H1: generated.h1,
      INTRO: generated.intro,
    }

    const created = await prisma.$transaction(
      (Object.entries(contentMap) as [SeoContentType, string][]).map(([type, content]) =>
        prisma.seoContent.create({
          data: { seoPageId: pageId, type, content, aiGenerated: true },
        })
      )
    )

    await prisma.seoPage.update({
      where: { id: pageId },
      data: { seoScore: analysis.seoScore, lastAnalysedAt: new Date() },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/seo/pages/[pageId]/generate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
