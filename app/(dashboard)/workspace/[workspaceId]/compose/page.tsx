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
    },
  })
  if (!workspace) notFound()

  const rawPatterns = workspace.brandProfile?.postingPatterns as Record<string, unknown> | null
  const postingPatterns: PostingPatterns = {}
  if (rawPatterns) {
    for (const [key, val] of Object.entries(rawPatterns)) {
      if (key !== 'guidelines' && typeof val === 'object' && val !== null && 'topSlots' in val) {
        postingPatterns[key] = val as PostingPatterns[string]
      }
    }
  }

  const socialAccounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true },
    select: { platform: true },
  })
  const connectedPlatforms = [...new Set(socialAccounts.map((a) => a.platform as string))]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-4xl text-text-primary">Compose</h2>
        <p className="font-sans text-sm text-text-secondary mt-1">{workspace.name}</p>
      </div>

      <ComposeClient
        workspaceId={workspaceId}
        connectedPlatforms={connectedPlatforms}
        postingPatterns={Object.keys(postingPatterns).length > 0 ? postingPatterns : null}
      />
    </div>
  )
}
