import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SeoConnect } from '@/components/lyra/seo/seo-connect'
import { SeoDashboard } from '@/components/lyra/seo/seo-dashboard'
import type { SeoPage, SeoContent } from '@prisma/client'

interface Props {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ connected?: string; error?: string }>
}

export type SeoPageWithContent = SeoPage & { content: SeoContent[] }

export default async function SeoWorkspacePage({ params, searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params
  const { connected, error } = await searchParams

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      seoConnection: { select: { propertyUrl: true } },
      seoPages: {
        include: { content: { orderBy: { createdAt: 'desc' } } },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })
  if (!workspace) notFound()

  if (!workspace.seoConnection) {
    return (
      <SeoConnect
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        error={error}
      />
    )
  }

  return (
    <SeoDashboard
      workspaceId={workspaceId}
      workspaceName={workspace.name}
      propertyUrl={workspace.seoConnection.propertyUrl}
      initialPages={workspace.seoPages as SeoPageWithContent[]}
      justConnected={connected === 'true'}
    />
  )
}
