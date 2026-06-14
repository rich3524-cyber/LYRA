export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { auth0 } from '@/lib/auth0'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/lyra/app-shell/app-shell'
import { computeSetupProgress } from '@/lib/setup-progress'
import type { SetupProgressData } from '@/lib/setup-progress'

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

  // Use highest-plan workspace as the layout fallback (AGENCY > PRO > STARTER)
  const PLAN_PRIORITY: Record<string, number> = { AGENCY: 3, PRO: 2, STARTER: 1 }
  const sortedAccess = [...user.workspaceAccess].sort(
    (a, b) => (PLAN_PRIORITY[b.workspace.plan] ?? 0) - (PLAN_PRIORITY[a.workspace.plan] ?? 0)
  )
  const workspaceId = sortedAccess[0]?.workspaceId ?? ''

  // Check whether Brand AI is unlocked and compute setup progress for the active workspace
  let brandReady = false
  let workspacePlan: string | undefined
  let setupProgress: SetupProgressData | undefined
  let trendEnabled = false
  if (workspaceId) {
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: {
        plan: true,
        websiteUrl: true,
        aiResponseMode: true,
        trendEnabled: true,
        brandProfile: { select: { voiceSummary: true } },
        _count: {
          select: {
            socialAccounts: { where: { isActive: true } },
            posts: { where: { status: { in: ['SCHEDULED', 'PUBLISHED', 'APPROVED'] as const } } },
          },
        },
      },
    }).catch(() => null)
    brandReady = !!(ws?.websiteUrl && (ws._count?.socialAccounts ?? 0) > 0)
    workspacePlan = ws?.plan ?? undefined
    trendEnabled = ws?.trendEnabled ?? false
    setupProgress = computeSetupProgress(ws)
  }

  return (
    <AppShell
      user={user}
      plan={workspacePlan}
      workspaceId={workspaceId}
      brandReady={brandReady}
      setupProgress={setupProgress}
      trendEnabled={trendEnabled}
    >
      {children}
    </AppShell>
  )
}
