import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ComposeClient } from '@/components/lyra/composer/compose-client'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function ComposePage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      brandProfile: { select: { postingPatterns: true } },
      socialAccounts: { where: { isActive: true }, select: { platform: true } },
    },
  })

  if (!workspace) notFound()

  const connectedPlatforms = [...new Set(workspace.socialAccounts.map(a => a.platform as string))]
  const postingPatterns = (workspace.brandProfile?.postingPatterns ?? null) as PostingPatterns | null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">Compose</h2>
        <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
      </div>

      <ComposeClient
        workspaceId={workspaceId}
        connectedPlatforms={connectedPlatforms}
        postingPatterns={postingPatterns}
      />
    </div>
  )
}
