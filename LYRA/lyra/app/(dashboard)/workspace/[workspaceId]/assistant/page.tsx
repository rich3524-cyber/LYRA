import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const user = await requireAuth()
  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true },
  })
  if (!workspace) redirect('/')

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <Sparkles className="h-10 w-10 text-text-tertiary" strokeWidth={1.5} />
      <h1 className="font-display text-4xl text-text-primary">LYRA Assistant</h1>
      <p className="text-sm font-sans text-text-secondary max-w-sm">
        Your AI-powered brand assistant is coming soon. Ask anything about your content strategy, brand voice, or performance.
      </p>
    </div>
  )
}
