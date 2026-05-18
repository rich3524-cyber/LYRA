import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const pages = await prisma.seoPage.findMany({
      where: { workspaceId },
      include: { content: { orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(pages)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/seo/pages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, url } = await req.json() as { workspaceId: string; url: string }

    if (!workspaceId || !url) {
      return NextResponse.json({ error: 'workspaceId and url required' }, { status: 400 })
    }

    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const page = await prisma.seoPage.create({
      data: { workspaceId, url },
      include: { content: true },
    })

    return NextResponse.json(page, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'URL already tracked' }, { status: 409 })
    }
    console.error('POST /api/seo/pages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
