export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CrisisBanner } from '@/components/lyra/crisis/crisis-banner'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { workspaceId: string }
}) {
  const { workspaceId } = params

  const user = await requireAuth().catch(() => null)

  let workspace: { crisisActive: boolean; crisisTriggeredAt: Date | null } | null = null

  if (user && workspaceId) {
    workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        access: { some: { userId: user.id } },
      },
      select: {
        crisisActive: true,
        crisisTriggeredAt: true,
      },
    }).catch(() => null)
  }

  return (
    <>
      {workspace?.crisisActive && (
        <CrisisBanner
          workspaceId={workspaceId}
          triggeredAt={workspace.crisisTriggeredAt?.toISOString() ?? null}
        />
      )}
      {children}
    </>
  )
}
