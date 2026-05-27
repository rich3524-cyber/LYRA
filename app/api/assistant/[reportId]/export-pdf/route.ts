import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDownloadPresignedUrl, putObject } from '@/lib/s3'
import { generatePDF } from '@/services/assistant/pdf-generator'
import type { ReportData } from '@/services/assistant/report-types'

export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireAuth()
    const { reportId } = await params

    const report = await prisma.assistantReport.findFirst({
      where: {
        id: reportId,
        workspace: { access: { some: { userId: user.id } } },
      },
      include: {
        workspace: {
          select: { id: true, name: true, plan: true, clientLogoS3Key: true },
        },
      },
    })

    if (!report) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (report.workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
    }

    if (report.status !== 'READY' || !report.reportData) {
      return NextResponse.json({ error: 'Report not ready' }, { status: 422 })
    }

    if (report.pdfS3Key) {
      const url = await getDownloadPresignedUrl(report.pdfS3Key)
      return NextResponse.json({ url })
    }

    let clientLogoUrl: string | null = null
    if (report.workspace.clientLogoS3Key) {
      clientLogoUrl = await getDownloadPresignedUrl(report.workspace.clientLogoS3Key)
    }

    const pdfBuffer = await generatePDF(
      report.reportData as unknown as ReportData,
      report.workspace.name,
      report.quarter,
      clientLogoUrl
    )

    const s3Key = `assistant-reports/${report.workspace.id}/${report.id}.pdf`
    await putObject(s3Key, pdfBuffer, 'application/pdf')

    await prisma.assistantReport.update({
      where: { id: report.id },
      data: { pdfS3Key: s3Key },
    })

    const url = await getDownloadPresignedUrl(s3Key)
    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PDF export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
