import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RepurposeForm } from '@/components/lyra/repurpose/repurpose-form'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function RepurposePage({ params }: Props) {
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
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-3xl text-text-primary">Repurpose Content</h1>
      <p className="text-sm font-sans text-text-secondary">
        Paste a blog URL or long-form text. LYRA generates platform-native posts for each channel you select.
      </p>
      <RepurposeForm workspaceId={workspaceId} />
    </div>
  )
}
