export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
import { auth0 } from '@/lib/auth0'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/lyra/app-shell/sidebar'
import { Header } from '@/components/lyra/app-shell/header'
import { MobileNav } from '@/components/lyra/app-shell/mobile-nav'

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

  const workspaceId = user.workspaceAccess[0]?.workspaceId ?? ''

  // Check whether Brand AI is unlocked for the active workspace
  let brandReady = false
  let workspacePlan: string | undefined
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
  }

  const isFoundingMember = user.agency?.foundingMember ?? false

  return (
    <div className="flex h-screen overflow-hidden bg-background-primary">
      <Sidebar workspaceId={workspaceId} brandReady={brandReady} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={user} plan={workspacePlan} foundingMember={isFoundingMember} />
        <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6 animate-fade-in">
          {children}
        </main>
      </div>
      <MobileNav workspaceId={workspaceId} />
    </div>
  )
}
