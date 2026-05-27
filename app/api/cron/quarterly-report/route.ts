import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getQuarterLabel,
  getPeriodBounds,
  countQualifyingPosts,
  calculateMetrics,
  generateReportData,
} from '@/services/assistant/report-generator'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const quarter = getQuarterLabel(prevMonth)
  const { from, to } = getPeriodBounds(90)

  const workspaces = await prisma.workspace.findMany({
    where: {
      plan: { in: ['PRO', 'AGENCY'] },
    },
    select: {
      id: true,
      name: true,
      region: true,
      brandProfile: { select: { contentThemes: true, voiceSummary: true } },
    },
  })

  const results = { generated: 0, skipped: 0, failed: 0 }

  for (const workspace of workspaces) {
    try {
      const qualifying = await countQualifyingPosts(workspace.id, from, to)
      if (qualifying < 5) {
        console.log(`Cron: skipping workspace ${workspace.id} — only ${qualifying} qualifying posts`)
        results.skipped++
        continue
      }

      const existing = await prisma.assistantReport.findFirst({
        where: { workspaceId: workspace.id, quarter },
      })
      if (existing) {
        results.skipped++
        continue
      }

      const report = await prisma.assistantReport.create({
        data: { workspaceId: workspace.id, quarter },
      })

      try {
        const metrics = await calculateMetrics(workspace.id, from, to)
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

        await prisma.assistantReport.update({
          where: { id: report.id },
          data: {
            status: 'READY',
            reportData: reportData as object,
            generatedAt: new Date(),
          },
        })
        results.generated++
      } catch {
        await prisma.assistantReport.update({
          where: { id: report.id },
          data: { status: 'FAILED' },
        })
        results.failed++
      }
    } catch (err) {
      console.error(`Cron: error processing workspace ${workspace.id}:`, err)
      results.failed++
    }
  }

  return NextResponse.json({ quarter, ...results })
}
