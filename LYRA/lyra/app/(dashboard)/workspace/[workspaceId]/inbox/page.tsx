import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ResponseInbox } from '@/components/lyra/inbox/response-inbox'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function InboxPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true },
  })

  if (!workspace) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">Comment Inbox</h2>
        <p className="text-sm text-text-tertiary mt-1">{workspace.name}</p>
      </div>
      <ResponseInbox workspaceId={workspaceId} />
    </div>
  )
}
