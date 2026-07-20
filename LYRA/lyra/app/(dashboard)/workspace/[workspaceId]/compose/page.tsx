import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ComposeClient } from '@/components/lyra/composer/compose-client'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'

interface Props {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ postId?: string }>
}

export default async function ComposePage({ params, searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params
  const { postId } = await searchParams

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      brandProfile: { select: { postingPatterns: true } },
    },
  })
  if (!workspace) notFound()

  // Editing an existing post — scoped to this workspace (already access-checked above)
  const postToEdit = postId
    ? await prisma.post.findFirst({
        where: { id: postId, workspaceId },
        select: {
          id: true,
          content: true,
          mediaUrls: true,
          scheduledAt: true,
          status: true,
          requiresMedia: true,
          socialAccount: { select: { platform: true } },
        },
      })
    : null

  const editingPost = postToEdit
    ? {
        id: postToEdit.id,
        content: postToEdit.content,
        mediaUrls: postToEdit.mediaUrls,
        scheduledAt: postToEdit.scheduledAt ? postToEdit.scheduledAt.toISOString() : null,
        status: postToEdit.status,
        platform: postToEdit.socialAccount.platform,
        requiresMedia: postToEdit.requiresMedia,
      }
    : null

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
        editingPost={editingPost}
      />
    </div>
  )
}
