import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { CalendarIcon, MessageSquare, Share2, PenSquare, CheckCircle2, Circle, ArrowRight, ChevronRight } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeSetupProgress } from '@/lib/setup-progress'

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

const MILESTONE_STEPS = [
  {
    key: 'socialConnected' as const,
    label: 'Connect a social account',
    href: (id: string) => `/workspace/${id}/settings`,
  },
  {
    key: 'brandBuilt' as const,
    label: 'Build your brand profile',
    href: (id: string) => `/workspace/${id}/brand`,
  },
  {
    key: 'postScheduled' as const,
    label: 'Schedule your first post',
    href: (id: string) => `/workspace/${id}/compose`,
  },
  {
    key: 'aiActive' as const,
    label: 'Activate AI responses',
    href: (id: string) => `/workspace/${id}/settings`,
  },
]

export default async function WorkspaceOverviewPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [workspace, scheduledCount, pendingCount, todaysPosts, urgentComment, recentPosts] = await Promise.all([
    prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: {
        id: true,
        name: true,
        industry: true,
        aiResponseMode: true,
        brandProfile: { select: { voiceSummary: true } },
        _count: { select: { socialAccounts: { where: { isActive: true } }, posts: true } },
      },
    }),
    prisma.post.count({
      where: { workspaceId, status: 'SCHEDULED', scheduledAt: { gte: now, lt: in7Days } },
    }),
    prisma.comment.count({
      where: { workspaceId, status: { in: ['PENDING', 'AI_DRAFTED'] } },
    }),
    prisma.post.findMany({
      where: { workspaceId, status: 'SCHEDULED', scheduledAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { scheduledAt: 'asc' },
      take: 8,
      select: {
        id: true,
        content: true,
        scheduledAt: true,
        socialAccount: { select: { platform: true } },
      },
    }),
    prisma.comment.findFirst({
      where: { workspaceId, status: { in: ['PENDING', 'AI_DRAFTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, content: true, status: true, createdAt: true },
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

  if (!workspace) notFound()

  const accountCount = workspace._count.socialAccounts
  const setupProgress = computeSetupProgress(workspace)

  const stats = [
    {
      label: 'Scheduled this week',
      value: scheduledCount,
      icon: CalendarIcon,
      href: `/workspace/${workspaceId}/calendar`,
      alert: false,
      sub: scheduledCount === 0 ? 'Nothing queued' : `${scheduledCount} post${scheduledCount !== 1 ? 's' : ''} ahead`,
    },
    {
      label: 'Pending responses',
      value: pendingCount,
      icon: MessageSquare,
      href: `/workspace/${workspaceId}/inbox`,
      alert: pendingCount > 0,
      sub: pendingCount === 0 ? 'Inbox clear' : 'Awaiting review',
    },
    {
      label: 'Connected accounts',
      value: accountCount,
      icon: Share2,
      href: `/workspace/${workspaceId}/settings`,
      alert: accountCount === 0,
      sub: accountCount === 0 ? 'None connected' : `${accountCount} platform${accountCount !== 1 ? 's' : ''} active`,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div>
        <h2 className="font-display text-2xl text-text-primary">{workspace.name}</h2>
        {workspace.industry && (
          <p className="text-text-secondary text-sm mt-1">{workspace.industry}</p>
        )}
      </div>

      {/* Setup progress — shown until 100% */}
      {setupProgress.percent < 100 && (
        <div className="rounded-xl bg-background-secondary border border-background-border overflow-hidden">
          <div className="px-5 py-4 border-b border-background-border flex items-center justify-between">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Getting started
            </p>
            <span className="font-mono text-[11px] text-text-secondary tabular-nums">
              {setupProgress.percent}%
            </span>
          </div>

          <div className="px-5 pt-4">
            <div className="h-[2px] rounded-full bg-background-border overflow-hidden mb-5">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${setupProgress.percent}%`,
                  background: 'linear-gradient(90deg, #60a5fa 0%, #2dd4bf 50%, #4ade80 100%)',
                }}
              />
            </div>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {MILESTONE_STEPS.map(({ key, label, href }) => {
              const done = setupProgress.milestones[key]
              return (
                <div key={key} className={`flex items-center gap-3 ${done ? 'opacity-40' : ''}`}>
                  {done ? (
                    <CheckCircle2 size={14} strokeWidth={1.5} className="text-status-success shrink-0" />
                  ) : (
                    <Circle size={14} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
                  )}
                  {done ? (
                    <span className="font-sans text-sm text-text-secondary">{label}</span>
                  ) : (
                    <Link
                      href={href(workspaceId)}
                      className="font-sans text-sm text-text-primary hover:text-accent-platinum transition-colors flex items-center gap-1.5"
                    >
                      {label}
                      <ArrowRight size={12} strokeWidth={1.5} className="text-text-tertiary" />
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Today's publishing timeline */}
      {todaysPosts.length > 0 && (
        <div className="rounded-xl bg-background-secondary border border-background-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-background-border">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Publishing today
            </p>
            <Link
              href={`/workspace/${workspaceId}/calendar`}
              className="font-sans text-xs text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1"
            >
              <span className="font-mono">{todaysPosts.length}</span>
              {todaysPosts.length === 1 ? ' post' : ' posts'}
              <ChevronRight size={12} strokeWidth={1.5} />
            </Link>
          </div>
          <div className="flex gap-3 p-4 overflow-x-auto">
            {todaysPosts.map(post => (
              <div
                key={post.id}
                className="flex-none w-44 p-3 rounded-lg bg-background-tertiary border border-background-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-text-secondary">
                    {post.scheduledAt ? format(new Date(post.scheduledAt), 'h:mm a') : '—'}
                  </span>
                  {post.socialAccount?.platform && (
                    <span className="font-mono text-[10px] text-text-tertiary">
                      {PLATFORM_SHORT[post.socialAccount.platform] ?? post.socialAccount.platform}
                    </span>
                  )}
                </div>
                <p className="font-sans text-xs text-text-secondary leading-relaxed line-clamp-3">
                  {post.content.length > 80 ? `${post.content.slice(0, 80)}…` : post.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, href, alert, sub }) => (
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
            <p className={`font-sans text-xs mt-2 ${alert && value > 0 ? 'text-status-warning/70' : 'text-text-tertiary'}`}>
              {sub}
            </p>
          </Link>
        ))}
      </div>

      {/* Bottom section: recent posts + urgent comment */}
      <div className={`grid gap-4 ${pendingCount > 0 && urgentComment ? 'grid-cols-1 lg:grid-cols-[1fr_340px]' : 'grid-cols-1'}`}>
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

        {/* Urgent comment */}
        {pendingCount > 0 && urgentComment && (
          <div className="rounded-xl bg-background-secondary border border-background-border overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-background-border">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Needs attention
              </p>
              <span className="font-mono text-[11px] text-status-warning tabular-nums">
                {pendingCount}
              </span>
            </div>
            <div className="px-5 py-4 flex-1">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-status-warning mt-[7px] shrink-0" />
                <div className="min-w-0">
                  <p className="font-sans text-sm text-text-primary leading-relaxed mb-2">
                    {urgentComment.content.length > 120
                      ? `${urgentComment.content.slice(0, 120)}…`
                      : urgentComment.content}
                  </p>
                  <p className="font-sans text-xs text-text-tertiary">
                    {format(new Date(urgentComment.createdAt), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <Link
                href={`/workspace/${workspaceId}/inbox`}
                className="inline-flex items-center justify-center gap-1.5 w-full min-h-[36px] px-3 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium hover:bg-accent-white transition-colors"
              >
                Review and respond
                <ArrowRight size={12} strokeWidth={2} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
