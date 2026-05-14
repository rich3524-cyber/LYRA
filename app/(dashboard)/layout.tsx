export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { auth0 } from '@/lib/auth0'
import { getCurrentUser } from '@/lib/auth'
import { Sidebar } from '@/components/lyra/app-shell/sidebar'
import { Header } from '@/components/lyra/app-shell/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Step 1: check Auth0 session — if no session at all, go to login
  const session = await auth0.getSession().catch(() => null)
  if (!session?.user) redirect('/auth/login')

  // Step 2: get/create DB user — if this fails, session exists so DON'T
  // redirect to login (that causes an infinite loop). Surface the error instead.
  const user = await getCurrentUser()
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#080808]">
        <div className="text-center space-y-3">
          <p className="text-[#e2e2e2] font-sans">Setting up your account…</p>
          <p className="text-[#555] text-sm font-sans">
            If this persists, check Netlify function logs for a DB connection error.
          </p>
        </div>
      </div>
    )
  }

  const workspaceId = user.workspaceAccess[0]?.workspaceId ?? ''

  return (
    <div className="flex h-screen overflow-hidden bg-background-primary">
      <Sidebar workspaceId={workspaceId} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={user} title="" />
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
