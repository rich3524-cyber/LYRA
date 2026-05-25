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
  params: { workspaceId: string }
}) {
  const { workspaceId } = params

  const user = await requireAuth()

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      access: { some: { userId: user.id } },
    },
    select: {
      crisisActive: true,
      crisisTriggeredAt: true,
    },
  })

  if (!workspace) {
    notFound()
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
