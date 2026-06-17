'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

interface AppShellClientProps {
  user: { name?: string | null; email: string; avatarUrl?: string | null }
  workspaceId: string
  brandReady: boolean
  plan?: string
  trendEnabled?: boolean
  children: React.ReactNode
}

export function AppShellClient({
  user,
  workspaceId,
  brandReady,
  plan,
  trendEnabled,
  children,
}: AppShellClientProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background-primary">
      <Sidebar
        workspaceId={workspaceId}
        brandReady={brandReady}
        plan={plan}
        trendEnabled={trendEnabled}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header
          user={user}
          plan={plan}
          onMenuOpen={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
