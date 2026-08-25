export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { auth0 } from '@/lib/auth0'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShellClient } from '@/components/lyra/app-shell/app-shell-client'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth0.getSession().catch(() => null)
  if (!session?.user) redirect('/auth/login')

  const user = await getCurrentUser()
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-background-primary">
        <div className="text-center space-y-3">
          <p className="text-text-primary font-sans">Setting up your account…</p>
          <p className="text-text-tertiary text-sm font-sans">
            If this persists, check Netlify function logs for a DB connection error.
          </p>
        </div>
      </div>
    )
  }

  // Determine the active workspace: URL param → highest-plan workspace → cookie
  const h = await headers()
  const pathname = h.get('x-pathname') ?? ''
  const urlWorkspaceId = pathname.match(/\/workspace\/([^/?]+)/)?.[1] ?? ''

  const PLAN_PRIORITY: Record<string, number> = { AGENCY: 3, PRO: 2, STARTER: 1 }
  const sortedAccess = [...user.workspaceAccess].sort(
    (a, b) => (PLAN_PRIORITY[b.workspace.plan] ?? 0) - (PLAN_PRIORITY[a.workspace.plan] ?? 0)
  )
  const planFallbackId = sortedAccess[0]?.workspaceId ?? ''

  const c = await cookies()
  const cookieWorkspaceId = c.get('lyra-active-workspace')?.value ?? ''

  const workspaceId = urlWorkspaceId || planFallbackId || cookieWorkspaceId

  let brandReady = false
  let workspacePlan: string | undefined
  let unreadCount = 0
  if (workspaceId) {
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: {
        plan: true,
        websiteUrl: true,
        _count: { select: { socialAccounts: { where: { isActive: true } } } },
      },
    }).catch(() => null)
    brandReady = !!(ws?.websiteUrl && (ws._count?.socialAccounts ?? 0) > 0)
    workspacePlan = ws?.plan ?? undefined

    unreadCount = await prisma.comment.count({
      where: {
        workspaceId,
        status: { in: ['PENDING', 'AI_DRAFTED', 'ESCALATED'] },
      },
    }).catch(() => 0)
  }

  return (
    <AppShellClient
      user={user}
      workspaceId={workspaceId}
      brandReady={brandReady}
      plan={workspacePlan}
      unreadCount={unreadCount}
    >
      {children}
    </AppShellClient>
  )
}
