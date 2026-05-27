import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AssistantUpsell } from '@/components/lyra/assistant/assistant-upsell'
import { AssistantReportView } from '@/components/lyra/assistant/assistant-report-view'

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const user = await requireAuth()
  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, plan: true, name: true },
  })
  if (!workspace) notFound()

  return (
    <main className="flex-1 overflow-y-auto bg-background-primary">
      {workspace.plan === 'STARTER' ? (
        <AssistantUpsell />
      ) : (
        <AssistantReportView workspaceId={workspaceId} workspaceName={workspace.name} />
      )}
    </main>
  )
}
