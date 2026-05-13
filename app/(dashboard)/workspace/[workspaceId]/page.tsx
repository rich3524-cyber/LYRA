import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function WorkspaceOverviewPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true, industry: true },
  })

  if (!workspace) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">{workspace.name}</h2>
        {workspace.industry && (
          <p className="text-text-secondary text-sm mt-1">{workspace.industry}</p>
        )}
      </div>

      {/* Skeleton placeholders — real content added in later tasks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-background-secondary border border-background-border animate-pulse"
          />
        ))}
      </div>

      <div className="h-64 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
    </div>
  )
}
