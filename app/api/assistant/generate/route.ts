import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getQuarterLabel,
  getPeriodBounds,
  countQualifyingPosts,
  calculateMetrics,
  generateReportData,
} from '@/services/assistant/report-generator'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        access: { some: { userId: user.id } },
      },
      select: {
        id: true,
        name: true,
        plan: true,
        region: true,
        brandProfile: {
          select: { contentThemes: true, voiceSummary: true },
        },
      },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
    }

    const { from, to } = getPeriodBounds(90)
    const quarter = getQuarterLabel(new Date())

    const qualifying = await countQualifyingPosts(workspaceId, from, to)
    if (qualifying < 5) {
      return NextResponse.json(
        { error: 'Not enough data', detail: `${qualifying} published posts found. Minimum 5 required.` },
        { status: 422 }
      )
    }

    // Clear cached PDF for this quarter if regenerating
    await prisma.assistantReport.updateMany({
      where: { workspaceId, quarter, status: 'READY' },
      data: { pdfS3Key: null },
    })

    const report = await prisma.assistantReport.create({
      data: {
        workspaceId,
        quarter,
      },
    })

    try {
      const metrics = await calculateMetrics(workspaceId, from, to)
      const f = new Date(from)
      const t = new Date(to)
      const fmt = (d: Date) => d.toLocaleString('en-AU', { month: 'short', year: 'numeric' })
      const periodLabel = `${fmt(f)}–${fmt(t)}`

      const reportData = await generateReportData(
        metrics,
        { from, to, label: periodLabel },
        workspace.region,
        workspace.brandProfile
      )

      const updated = await prisma.assistantReport.update({
        where: { id: report.id },
        data: {
          status: 'READY',
          reportData: reportData as object,
          generatedAt: new Date(),
        },
      })

      return NextResponse.json({ report: updated })
    } catch (genError) {
      await prisma.assistantReport.update({
        where: { id: report.id },
        data: { status: 'FAILED' },
      })
      console.error('Report generation failed:', genError)
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
