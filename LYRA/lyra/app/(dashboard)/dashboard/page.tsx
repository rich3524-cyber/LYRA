import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Plus, Building2, PenSquare, MessageSquare, Zap, Globe, Share2, ChevronRight } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK:        '#1877F2',
  INSTAGRAM:       '#E1306C',
  LINKEDIN:        '#0A66C2',
  TWITTER:         '#1DA1F2',
  TIKTOK:          '#010101',
  GOOGLE_BUSINESS: '#EA4335',
  YOUTUBE:         '#FF0000',
}

export default async function DashboardHome() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const workspaces = user.workspaceAccess.map((wa) => wa.workspace)
  const hasWorkspaces = workspaces.length > 0
  const firstName = user.name?.split(' ')[0] ?? null

  const activeWorkspaceId = workspaces[0]?.id ?? ''

  let brandReady = false
  let hasBrandProfile = false

  // KPI data
  let pendingComments = 0
  let scheduledToday = 0
  let postsThisWeek = 0

  // Workspace card data
  let workspaceDetails: {
    id: string
    name: string
    plan: string
    platforms: string[]
    pendingCount: number
  }[] = []

  if (hasWorkspaces && activeWorkspaceId) {
    const workspaceIds = workspaces.map((w) => w.id)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const weekStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    const weekEnd    = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7)

    const [ws, pendingCommentsCount, scheduledTodayCount, postsThisWeekCount, wsDetails] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: activeWorkspaceId },
        select: {
          websiteUrl: true,
          brandProfile: { select: { id: true } },
          _count: { select: { socialAccounts: { where: { isActive: true } } } },
        },
      }).catch(() => null),

      prisma.comment.count({
        where: {
          post: { workspaceId: { in: workspaceIds } },
          status: 'PENDING',
        },
      }).catch(() => 0),

      prisma.post.count({
        where: {
          workspaceId: { in: workspaceIds },
          status: 'SCHEDULED',
          scheduledAt: { gte: todayStart, lt: todayEnd },
        },
      }).catch(() => 0),

      prisma.post.count({
        where: {
          workspaceId: { in: workspaceIds },
          status: { in: ['PUBLISHED', 'SCHEDULED'] },
          scheduledAt: { gte: weekStart, lt: weekEnd },
        },
      }).catch(() => 0),

      prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: {
          id: true,
          name: true,
          plan: true,
          socialAccounts: { where: { isActive: true }, select: { platform: true } },
          _count: {
            select: {
              posts: { where: { comments: { some: { status: 'PENDING' } } } },
            },
          },
        },
      }).catch(() => []),
    ])

    brandReady = !!(ws?.websiteUrl && (ws._count?.socialAccounts ?? 0) > 0)
    hasBrandProfile = !!ws?.brandProfile
    pendingComments = pendingCommentsCount
    scheduledToday = scheduledTodayCount
    postsThisWeek = postsThisWeekCount

    workspaceDetails = wsDetails.map((w) => ({
      id: w.id,
      name: w.name,
      plan: w.plan,
      platforms: [...new Set(w.socialAccounts.map((a) => a.platform))],
      pendingCount: w._count.posts,
    }))
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Display heading */}
      <div className="space-y-1.5">
        <h1 className="font-display text-4xl text-text-primary leading-tight">
          {hasWorkspaces
            ? firstName ? `Good to see you, ${firstName}.` : 'Welcome back.'
            : 'Welcome to LYRA.'}
        </h1>
        <p className="font-sans text-sm text-text-secondary">
          {hasWorkspaces
            ? `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} under management.`
            : 'Create your first workspace to begin.'}
        </p>
      </div>

      {hasWorkspaces ? (
        <>
          {/* KPI status strip */}
          <div className="grid grid-cols-3 gap-3">
            <Link
              href={`/workspace/${activeWorkspaceId}/inbox`}
              className="p-4 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid transition-all duration-150 space-y-1"
            >
              <p className="font-mono text-2xl text-text-primary tabular-nums">{pendingComments}</p>
              <p className="font-sans text-xs text-text-tertiary">Pending comments</p>
            </Link>
            <Link
              href={`/workspace/${activeWorkspaceId}/calendar`}
              className="p-4 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid transition-all duration-150 space-y-1"
            >
              <p className="font-mono text-2xl text-text-primary tabular-nums">{scheduledToday}</p>
              <p className="font-sans text-xs text-text-tertiary">Scheduled today</p>
            </Link>
            <Link
              href={`/workspace/${activeWorkspaceId}/analytics`}
              className="p-4 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid transition-all duration-150 space-y-1"
            >
              <p className="font-mono text-2xl text-text-primary tabular-nums">{postsThisWeek}</p>
              <p className="font-sans text-xs text-text-tertiary">Posts this week</p>
            </Link>
          </div>

          {/* Brand AI unlock banner */}
          {brandReady && !hasBrandProfile && (
            <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <div className="flex items-start gap-3">
                <Zap size={16} strokeWidth={1.5} className="text-accent-platinum shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-sans text-sm font-medium text-text-primary">
                    Brand AI is ready to build.
                  </p>
                  <p className="font-sans text-sm text-text-secondary leading-relaxed">
                    LYRA will now scrape your website and analyse your connected social accounts
                    to build your brand voice profile.
                  </p>
                </div>
              </div>
              <Link
                href={`/workspace/${activeWorkspaceId}/brand`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
              >
                <Zap size={14} strokeWidth={2} />
                Build brand profile
              </Link>
            </div>
          )}

          {/* Setup checklist */}
          {!brandReady && (
            <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
              <div className="space-y-0.5">
                <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                  Setup
                </p>
                <p className="font-sans text-sm text-text-secondary">
                  Complete these steps to unlock Brand AI.
                </p>
              </div>
              <div className="space-y-3">
                <SetupStep
                  icon={Globe}
                  label="Add your website URL"
                  done={true}
                  href={`/workspace/${activeWorkspaceId}/settings`}
                />
                <SetupStep
                  icon={Share2}
                  label="Connect at least one social account"
                  done={false}
                  href={`/workspace/${activeWorkspaceId}/settings`}
                />
                <SetupStep
                  icon={Zap}
                  label="Build your brand profile"
                  done={false}
                  href={`/workspace/${activeWorkspaceId}/brand`}
                  locked
                />
              </div>
            </div>
          )}

          {/* Workspaces */}
          <section className="space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Workspaces
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workspaceDetails.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/workspace/${ws.id}`}
                  className="group flex items-center justify-between p-5 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid transition-all duration-150"
                >
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <p className="font-sans text-sm font-medium text-text-primary">{ws.name}</p>
                      <p className="font-sans text-xs text-text-tertiary capitalize">
                        {ws.plan.charAt(0) + ws.plan.slice(1).toLowerCase()} plan
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ws.platforms.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {ws.platforms.map((platform) => (
                            <span
                              key={platform}
                              className="rounded-full"
                              style={{ width: 7, height: 7, backgroundColor: PLATFORM_COLORS[platform] ?? '#888' }}
                              title={platform}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="font-sans text-xs text-text-tertiary">No accounts connected</span>
                      )}
                      {ws.pendingCount > 0 && (
                        <span className="font-mono text-[10px] text-status-warning bg-status-warning/10 px-1.5 py-0.5 rounded-md">
                          {ws.pendingCount} pending
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={16} strokeWidth={1.5} className="text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </section>

          {/* Quick actions */}
          <section className="space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Quick actions
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href={`/workspace/${workspaces[0].id}/compose`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <PenSquare size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">Compose a post</span>
              </Link>
              <Link
                href={`/workspace/${workspaces[0].id}/inbox`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <MessageSquare size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">View inbox</span>
              </Link>
              <Link
                href="/agency/clients/new"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <Plus size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">Add workspace</span>
              </Link>
            </div>
          </section>
        </>
      ) : (
        <section className="py-12 space-y-6">
          <div className="space-y-2">
            <Building2 size={24} strokeWidth={1.5} className="text-text-tertiary" />
            <p className="font-sans text-sm text-text-secondary">No workspaces yet.</p>
            <p className="font-sans text-sm text-text-tertiary max-w-xs leading-relaxed">
              A workspace represents one client or brand. Connect social accounts, and LYRA
              handles scheduling and AI responses from there.
            </p>
          </div>
          <Link
            href="/agency/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            <Plus size={16} strokeWidth={2} />
            Create workspace
          </Link>
        </section>
      )}
    </div>
  )
}

function SetupStep({
  icon: Icon,
  label,
  done,
  href,
  locked,
}: {
  icon: React.ElementType
  label: string
  done: boolean
  href: string
  locked?: boolean
}) {
  const inner = (
    <div className={`group flex items-center gap-3 transition-opacity ${locked ? 'opacity-40' : 'hover:opacity-80'}`}>
      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${done ? 'border-status-success bg-status-success' : 'border-background-border-mid'}`}>
        {done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2 4-4" stroke="#080808" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <Icon size={14} strokeWidth={1.5} className={done ? 'text-text-secondary' : 'text-text-tertiary'} />
      <span className={`font-sans text-sm flex-1 ${done ? 'text-text-secondary' : 'text-text-tertiary'}`}>
        {label}
      </span>
      {!locked && (
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
        />
      )}
    </div>
  )

  if (locked) return <div>{inner}</div>
  return <Link href={href}>{inner}</Link>
}
