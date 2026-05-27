import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ScheduleReview } from '@/components/lyra/schedule/schedule-review'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function ScheduleReviewPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      access: { some: { userId: user.id } },
    },
    select: { id: true, name: true },
  })
  if (!workspace) notFound()

  return (
    <ScheduleReview
      workspaceId={workspaceId}
      workspaceName={workspace.name}
    />
  )
}
