import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const month       = searchParams.get('month') // yyyy-MM

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 })
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month must be in yyyy-MM format.' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [year, monthNum] = month.split('-').map(Number)
    const rangeStart = new Date(year, monthNum - 1, 1)
    const rangeEnd   = new Date(year, monthNum, 0, 23, 59, 59, 999)

    const campaigns = await prisma.emailCampaign.findMany({
      where: {
        workspaceId,
        OR: [
          { scheduledAt: { gte: rangeStart, lte: rangeEnd } },
          { sentAt:      { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      select: {
        id:          true,
        name:        true,
        subjectLine: true,
        status:      true,
        scheduledAt: true,
        sentAt:      true,
        emailConnection: { select: { provider: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { sentAt: 'asc' }],
    })

    return NextResponse.json({ campaigns })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[email/campaigns] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
