import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function TrendsPage({ params }: Props) {
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
        <h2 className="font-display text-2xl text-text-primary">LYRA Trend</h2>
        <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
      </div>
      <div className="p-8 rounded-xl bg-background-secondary border border-background-border text-center space-y-3">
        <p className="font-sans text-sm font-medium text-text-primary">LYRA Trend launches in Phase 3.</p>
        <p className="font-sans text-xs text-text-secondary">
          Daily brand-matched trend intelligence. Coming soon.
        </p>
      </div>
    </div>
  )
}
