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
  unreadCount?: number
  children: React.ReactNode
}

export function AppShellClient({
  user,
  workspaceId,
  brandReady,
  plan,
  trendEnabled,
  unreadCount,
  children,
}: AppShellClientProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background-primary">
      {/* Skip to main content — keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-200 focus:px-4 focus:py-2 focus:bg-accent-platinum focus:text-background-primary focus:rounded-lg focus:font-sans focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <Sidebar
        workspaceId={workspaceId}
        brandReady={brandReady}
        plan={plan}
        trendEnabled={trendEnabled}
        unreadCount={unreadCount}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header
          user={user}
          plan={plan}
          onMenuOpen={() => setMobileNavOpen(true)}
        />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
