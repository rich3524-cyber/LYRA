import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { CalendarIcon, MessageSquare, Share2, PenSquare } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface Props {
  params: Promise<{ workspaceId: string }>
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT:            'Draft',
  PENDING_APPROVAL: 'Pending',
  APPROVED:         'Approved',
  SCHEDULED:        'Scheduled',
  PUBLISHING:       'Publishing',
  PUBLISHED:        'Published',
  FAILED:           'Failed',
  CANCELLED:        'Cancelled',
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:            'text-text-tertiary bg-background-hover',
  PENDING_APPROVAL: 'text-status-warning bg-status-warning/10',
  APPROVED:         'text-status-info bg-status-info/10',
  SCHEDULED:        'text-status-info bg-status-info/10',
  PUBLISHING:       'text-status-warning bg-status-warning/10',
  PUBLISHED:        'text-status-success bg-status-success/10',
  FAILED:           'text-status-error bg-status-error/10',
  CANCELLED:        'text-text-tertiary bg-background-hover',
}

const PLATFORM_SHORT: Record<string, string> = {
  FACEBOOK: 'FB', INSTAGRAM: 'IG', LINKEDIN: 'LI',
  TIKTOK: 'TT', TWITTER: 'X', GOOGLE_BUSINESS: 'GBP',
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

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [scheduledCount, pendingCount, accountCount, recentPosts] = await Promise.all([
    prisma.post.count({
      where: {
        workspaceId,
        status: 'SCHEDULED',
        scheduledAt: { gte: now, lt: in7Days },
      },
    }),
    prisma.comment.count({
      where: {
        workspaceId,
        status: { in: ['PENDING', 'AI_DRAFTED'] },
      },
    }),
    prisma.socialAccount.count({
      where: { workspaceId, isActive: true },
    }),
    prisma.post.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        createdAt: true,
        socialAccount: { select: { platform: true } },
      },
    }),
  ])

  const stats = [
    {
      label: 'Scheduled this week',
      value: scheduledCount,
      icon: CalendarIcon,
      href: `/workspace/${workspaceId}/calendar`,
      alert: false,
    },
    {
      label: 'Pending responses',
      value: pendingCount,
      icon: MessageSquare,
      href: `/workspace/${workspaceId}/inbox`,
      alert: pendingCount > 0,
    },
    {
      label: 'Connected accounts',
      value: accountCount,
      icon: Share2,
      href: `/workspace/${workspaceId}/settings`,
      alert: accountCount === 0,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">{workspace.name}</h2>
        {workspace.industry && (
          <p className="text-text-secondary text-sm mt-1">{workspace.industry}</p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, href, alert }) => (
          <Link
            key={label}
            href={href}
            className="group flex flex-col justify-between p-5 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid transition-all duration-150"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                {label}
              </p>
              <Icon
                size={14}
                strokeWidth={1.5}
                className={alert ? 'text-status-warning' : 'text-text-tertiary group-hover:text-text-secondary transition-colors'}
              />
            </div>
            <p className={`font-mono text-3xl ${alert && value > 0 ? 'text-status-warning' : 'text-text-primary'}`}>
              {value}
            </p>
          </Link>
        ))}
      </div>

      {/* Recent posts */}
      <div className="rounded-xl bg-background-secondary border border-background-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-border">
          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
            Recent posts
          </p>
          <Link
            href={`/workspace/${workspaceId}/compose`}
            className="inline-flex items-center gap-1.5 font-sans text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            <PenSquare size={12} strokeWidth={1.5} />
            Compose
          </Link>
        </div>

        {recentPosts.length === 0 ? (
          <div className="px-5 py-12 text-center space-y-4">
            <p className="font-sans text-sm text-text-tertiary">No posts yet.</p>
            <Link
              href={`/workspace/${workspaceId}/compose`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium hover:bg-accent-white transition-colors"
            >
              <PenSquare size={12} strokeWidth={2} />
              Compose your first post
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-background-border">
            {recentPosts.map((post) => {
              const date = post.publishedAt ?? post.scheduledAt ?? post.createdAt
              const preview = post.content.length > 80
                ? `${post.content.slice(0, 80)}…`
                : post.content
              const platform = post.socialAccount?.platform
              const statusColour = STATUS_COLOUR[post.status] ?? 'text-text-tertiary bg-background-hover'
              const statusLabel = STATUS_LABEL[post.status] ?? post.status

              return (
                <div key={post.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0 flex items-center gap-3">
                    {platform && (
                      <span className="font-mono text-xs text-text-tertiary shrink-0 w-7">
                        {PLATFORM_SHORT[platform] ?? platform}
                      </span>
                    )}
                    <p className="font-sans text-sm text-text-primary truncate">
                      {preview || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-sans text-xs text-text-tertiary">
                      {format(new Date(date), 'MMM d')}
                    </span>
                    <span className={`font-sans text-xs px-2 py-0.5 rounded-md font-medium ${statusColour}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
