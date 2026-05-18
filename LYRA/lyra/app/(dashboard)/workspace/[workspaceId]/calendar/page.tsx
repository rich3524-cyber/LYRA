import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ContentCalendar } from '@/components/lyra/calendar/content-calendar'
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
    select: { id: true, name: true },
  })

  if (!workspace) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Calendar</h2>
          <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
        </div>
        <Link
          href={`/workspace/${workspaceId}/compose`}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-text-inverse hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
        >
          <Plus size={13} />
          New post
        </Link>
      </div>

      <ContentCalendar workspaceId={workspaceId} />
    </div>
  )
}
