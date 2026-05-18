import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PostComposer } from '@/components/lyra/composer/post-composer'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function ComposePage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true },
  })

  if (!workspace) notFound()

  const socialAccounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true },
    select: { platform: true },
  })

  const connectedPlatforms = [...new Set(socialAccounts.map((a) => a.platform as string))]

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">Compose</h2>
        <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
      </div>

      <PostComposer workspaceId={workspaceId} connectedPlatforms={connectedPlatforms} />

      {connectedPlatforms.length === 0 && (
        <p className="text-xs text-text-tertiary text-center">
          No social accounts connected yet.{' '}
          <a href={`/workspace/${workspaceId}/settings`} className="text-accent-silver hover:text-text-primary underline">
            Connect accounts
          </a>{' '}
          to start posting.
        </p>
      )}
    </div>
  )
}
