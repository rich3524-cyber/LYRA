'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutGrid,
  Calendar,
  PenSquare,
  MessageSquare,
  Zap,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Lock,
  Search,
  Crosshair,
  Scissors,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import { WorkspaceSwitcher } from './workspace-switcher'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '',              label: 'Dashboard',      icon: LayoutGrid,    proOnly: false },
  { href: '/calendar',     label: 'Calendar',       icon: Calendar,      proOnly: false },
  { href: '/compose',      label: 'Compose',        icon: PenSquare,     proOnly: false },
  { href: '/inbox',        label: 'Inbox',          icon: MessageSquare, proOnly: false },
  { href: '/brand',        label: 'Brand AI',       icon: Zap,           proOnly: false },
  { href: '/competitors',  label: 'Competitors',    icon: Crosshair,     proOnly: true  },
  { href: '/repurpose',    label: 'Repurpose',      icon: Scissors,      proOnly: false },
  { href: '/analytics',    label: 'Analytics',      icon: BarChart3,     proOnly: false },
  { href: '/seo',          label: 'SEO',            icon: Search,        proOnly: false },
  { href: '/assistant',    label: 'LYRA Assistant', icon: Sparkles,      proOnly: false },
]

interface SidebarProps {
  workspaceId: string
  brandReady: boolean
  plan?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
  trendEnabled?: boolean
  unreadCount?: number
}

export function Sidebar({
  workspaceId,
  brandReady,
  plan,
  mobileOpen,
  onMobileClose,
  trendEnabled,
  unreadCount,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const activeWorkspaceId = pathname.match(/\/workspace\/([^/]+)/)?.[1] ?? workspaceId
  const base = `/workspace/${activeWorkspaceId}`

  // Close mobile drawer when navigating
  useEffect(() => {
    onMobileClose?.()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function renderNavItems(isCollapsed: boolean) {
    return navItems.map(({ href, label, icon: Icon, proOnly }) => {
      const isBrandAI   = href === '/brand'
      const isAssistant = href === '/assistant'
      const locked = proOnly && plan === 'STARTER'

      if (locked) {
        const lockTitle = isBrandAI
          ? 'Connect your website and a social account to unlock Brand AI'
          : 'Upgrade to PRO or AGENCY to unlock this feature'
        return (
          <Link
            key={label}
            href={`${base}/settings`}
            title={lockTitle}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-text-tertiary hover:bg-background-hover transition-all duration-150"
            aria-label={isCollapsed ? `${label} (locked)` : undefined}
          >
            <Lock size={16} className="shrink-0" strokeWidth={1.5} />
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden whitespace-nowrap tracking-wide"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        )
      }

      const fullHref = `${base}${href}`
      const isActive = pathname === fullHref || (href !== '' && pathname.startsWith(fullHref))

      if (isAssistant) {
        return (
          <div key={label} className="pt-3">
            <Link
              href={fullHref}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 group border',
                isActive
                  ? 'bg-purple-500/10 border-purple-500/70 text-purple-300'
                  : 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/60 hover:text-purple-300',
              )}
              aria-label={isCollapsed ? label : undefined}
            >
              <Icon size={16} className="shrink-0" strokeWidth={isActive ? 2 : 1.5} />
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap tracking-wide"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          </div>
        )
      }

      const isInbox = href === '/inbox'
      const hasUnread = isInbox && (unreadCount ?? 0) > 0
      const unreadLabel = (unreadCount ?? 0) > 99 ? '99+' : String(unreadCount ?? 0)

      return (
        <Link
          key={label}
          href={fullHref}
          className={cn(
            'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 group',
            isActive
              ? 'bg-background-hover text-text-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-background-hover',
          )}
          aria-label={
            hasUnread
              ? `${label} (${unreadLabel} unread comment${unreadLabel === '1' ? '' : 's'})`
              : isCollapsed
              ? label
              : undefined
          }
        >
          <span className="relative shrink-0">
            <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
            {hasUnread && isCollapsed && (
              <span
                className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-status-error"
                aria-hidden="true"
              />
            )}
          </span>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className={cn(
                  'overflow-hidden whitespace-nowrap tracking-wide',
                  hasUnread && 'flex-1 flex items-center justify-between gap-2',
                )}
              >
                {hasUnread ? (
                  <>
                    <span>{label}</span>
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-status-error text-white text-[10px] font-medium leading-none">
                      {unreadLabel}
                    </span>
                  </>
                ) : (
                  label
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      )
    })
  }

  function renderContent(isCollapsed: boolean, isMobile = false) {
    return (
      <>
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-background-border shrink-0">
          <div className="flex-1">
            <AnimatePresence mode="wait">
              {!isCollapsed ? (
                <motion.div
                  key="full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Image
                    src="/brand/lyra-logo-primary.svg"
                    alt="LYRA"
                    width={96}
                    height={30}
                    priority
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="icon"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Image
                    src="/brand/lyra-icon-mark.svg"
                    alt="LYRA"
                    width={32}
                    height={32}
                    priority
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {isMobile && (
            <button
              onClick={onMobileClose}
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors duration-150"
              aria-label="Close navigation"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Workspace Switcher */}
        {!isCollapsed && (
          <div className="px-3 py-3 border-b border-background-border">
            <WorkspaceSwitcher workspaceId={activeWorkspaceId} />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {renderNavItems(isCollapsed)}
          {trendEnabled && (() => {
            const fullHref = `${base}/trends`
            const isActive = pathname === fullHref || pathname.startsWith(fullHref)
            return (
              <div key="trends" className="pt-1">
                <Link
                  href={fullHref}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 group',
                    isActive
                      ? 'bg-background-hover text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-background-hover',
                  )}
                  aria-label={isCollapsed ? 'Trends' : undefined}
                >
                  <TrendingUp size={16} className="shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="overflow-hidden whitespace-nowrap tracking-wide"
                      >
                        Trends
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </div>
            )
          })()}
        </nav>

        {/* Bottom nav */}
        <div className="border-t border-background-border p-2 space-y-0.5">
          <Link
            href={`${base}/settings`}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-all duration-150"
            aria-label={isCollapsed ? 'Settings' : undefined}
          >
            <Settings size={16} strokeWidth={1.5} className="shrink-0" />
            {!isCollapsed && <span className="tracking-wide">Settings</span>}
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative hidden lg:flex flex-col h-screen bg-background-secondary border-r border-background-border shrink-0 overflow-x-hidden"
      >
        {renderContent(collapsed)}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-background-tertiary border border-background-border flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors z-10 cursor-pointer"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={onMobileClose}
              aria-hidden="true"
            />
            <motion.aside
              key="mobile-drawer"
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed left-0 top-0 h-full w-60 flex flex-col bg-background-secondary border-r border-background-border z-50 lg:hidden overflow-y-auto"
            >
              {renderContent(false, true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
