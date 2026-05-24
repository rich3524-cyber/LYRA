import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ContentCalendar } from '@/components/lyra/calendar/content-calendar'
import { ScheduleGenerator } from '@/components/lyra/schedule/schedule-generator'
import Link from 'next/link'
import { Plus } from 'lucide-react'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      plan: true,
      brandProfile: { select: { id: true } },
      socialAccounts: { where: { isActive: true }, select: { platform: true } },
    },
  })

  if (!workspace) notFound()

  const hasBrandProfile    = workspace.brandProfile !== null
  const connectedPlatforms = [...new Set(workspace.socialAccounts.map(a => a.platform))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Calendar</h2>
          <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <ScheduleGenerator
            workspaceId={workspaceId}
            hasBrandProfile={hasBrandProfile}
            connectedPlatforms={connectedPlatforms}
          />
          <Link
            href={`/workspace/${workspaceId}/compose`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-text-inverse hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
          >
            <Plus size={13} />
            New post
          </Link>
        </div>
      </div>

      <ContentCalendar workspaceId={workspaceId} plan={workspace.plan} />
    </div>
  )
}
