import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AssistantUpsell } from '@/components/lyra/assistant/assistant-upsell'
import { AssistantReportView } from '@/components/lyra/assistant/assistant-report-view'

interface PageProps {
  params: Promise<{ workspaceId: string }>
}

export default async function AssistantPage({ params }: PageProps) {
  const { workspaceId } = await params
  const user = await requireAuth()

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      access: { some: { userId: user.id } },
    },
    select: {
      id: true,
      name: true,
      plan: true,
      assistantReports: {
        orderBy: { generatedAt: 'desc' },
        select: {
          id: true,
          quarter: true,
          status: true,
          generatedAt: true,
          reportData: true,
          pdfS3Key: true,
        },
      },
    },
  })

  if (!workspace) notFound()

  if (workspace.plan === 'STARTER') {
    return (
      <main className="flex-1 overflow-y-auto bg-background-primary">
        <AssistantUpsell />
      </main>
    )
  }

  const serialisedReports = workspace.assistantReports.map(r => ({
    ...r,
    generatedAt: r.generatedAt.toISOString(),
  }))

  return (
    <main className="flex-1 overflow-y-auto bg-background-primary">
      <AssistantReportView
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        initialReports={serialisedReports}
      />
    </main>
  )
}
