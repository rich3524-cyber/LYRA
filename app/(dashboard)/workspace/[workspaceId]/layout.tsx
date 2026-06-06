export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CrisisBanner } from '@/components/lyra/crisis/crisis-banner'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params

  const user = await requireAuth()

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      access: { some: { userId: user.id } },
    },
    select: {
      crisisActive:      true,
      crisisTriggeredAt: true,
      crisisEvents: {
        where:   { resolvedAt: null },
        orderBy: { triggeredAt: 'desc' },
        take:    1,
        select:  { triggerType: true, commentIds: true },
      },
    },
  })

  if (!workspace) {
    notFound()
  }

  const activeCrisis = workspace.crisisEvents[0] ?? null

  return (
    <>
      {workspace?.crisisActive && (
        <CrisisBanner
          workspaceId={workspaceId}
          triggeredAt={workspace.crisisTriggeredAt?.toISOString() ?? null}
          triggerType={activeCrisis?.triggerType ?? null}
          triggeringCommentCount={activeCrisis?.commentIds.length ?? 0}
        />
      )}
      {children}
    </>
  )
}
