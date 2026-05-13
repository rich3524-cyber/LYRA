import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Sidebar } from '@/components/lyra/app-shell/sidebar'
import { Header } from '@/components/lyra/app-shell/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

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
