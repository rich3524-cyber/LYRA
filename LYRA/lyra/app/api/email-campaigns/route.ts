import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth } from 'date-fns'

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  const month = req.nextUrl.searchParams.get('month') // yyyy-MM

  if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

  const access = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true },
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const monthDate = month ? new Date(`${month}-01`) : new Date()
  const start = startOfMonth(monthDate)
  const end = endOfMonth(monthDate)

  const campaigns = await prisma.emailCampaign.findMany({
    where: {
      integration: { workspaceId, isActive: true },
      scheduledAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      name: true,
      subject: true,
      scheduledAt: true,
      status: true,
      previewUrl: true,
      integration: { select: { provider: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })

  return NextResponse.json(campaigns)
}
