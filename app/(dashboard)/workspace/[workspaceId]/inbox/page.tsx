import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ResponseInbox } from '@/components/lyra/inbox/response-inbox'

export default async function InboxPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const user = await requireAuth()

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { plan: true, aiResponseMode: true },
  })
  if (!workspace) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans text-2xl font-medium text-text-primary">Inbox</h1>
        <p className="font-sans text-sm text-text-secondary mt-1">
          Review, edit, and send AI-drafted responses.
        </p>
      </div>
      <ResponseInbox
        workspaceId={workspaceId}
        plan={workspace.plan}
        aiResponseMode={workspace.aiResponseMode}
      />
    </div>
  )
}
