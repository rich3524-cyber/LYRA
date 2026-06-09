'use client'

import { useState, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { NavigationLoader } from './navigation-loader'
import type { SetupProgressData } from '@/lib/setup-progress'

interface AppShellProps {
  user: { name?: string | null; email: string; avatarUrl?: string | null }
  plan?: string
  workspaceId: string
  brandReady: boolean
  setupProgress?: SetupProgressData
  trendEnabled?: boolean
  children: React.ReactNode
}

export function AppShell({
  user,
  plan,
  workspaceId,
  brandReady,
  setupProgress,
  trendEnabled,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const handleMobileOpen  = useCallback(() => setMobileOpen(true),  [])
  const handleMobileClose = useCallback(() => setMobileOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden bg-background-primary">
      <NavigationLoader />
      <Sidebar
        workspaceId={workspaceId}
        brandReady={brandReady}
        plan={plan}
        setupProgress={setupProgress}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
        trendEnabled={trendEnabled}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header
          user={user}
          title=""
          plan={plan}
          onMobileMenuOpen={handleMobileOpen}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
