import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { TrendStatus } from '@prisma/client'

const VALID_STATUSES: TrendStatus[] = ['NEW', 'USED', 'DISMISSED']

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const { status } = await req.json() as { status: TrendStatus }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const trend = await prisma.trendItem.findFirst({
      where: { id },
      select: { workspaceId: true },
    })

    if (!trend) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: trend.workspaceId,
        access: { some: { userId: user.id } },
      },
      select: { trendEnabled: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!workspace.trendEnabled) {
      return NextResponse.json({ error: 'LYRA Trend not enabled' }, { status: 403 })
    }

    await prisma.trendItem.update({
      where: { id },
      data: { status },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PATCH /api/trends/[id]/status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
