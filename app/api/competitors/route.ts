import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const competitors = await prisma.competitor.findMany({
      where: { workspaceId },
      include: {
        snapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(competitors)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[competitors] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json().catch(() => null)
    const workspaceId = body?.workspaceId
    const name = body?.name
    if (typeof workspaceId !== 'string' || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, plan: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Competitor Intelligence requires PRO or AGENCY plan.' }, { status: 403 })
    }

    const count = await prisma.competitor.count({ where: { workspaceId } })
    if (count >= 10) {
      return NextResponse.json({ error: 'Maximum 10 competitors per workspace.' }, { status: 422 })
    }

    const competitor = await prisma.competitor.create({
      data: {
        workspaceId,
        name: name.trim(),
        websiteUrl: body.websiteUrl || null,
        twitterHandle: body.twitterHandle || null,
        facebookPageId: body.facebookPageId || null,
      },
    })

    return NextResponse.json(competitor, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[competitors] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
