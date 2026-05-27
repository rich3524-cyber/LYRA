import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const workspaceId = req.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        access: { some: { userId: user.id } },
      },
      select: { plan: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
    }

    const reports = await prisma.assistantReport.findMany({
      where: { workspaceId },
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true,
        quarter: true,
        status: true,
        generatedAt: true,
        reportData: true,
        pdfS3Key: true,
      },
    })

    return NextResponse.json({ reports })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
