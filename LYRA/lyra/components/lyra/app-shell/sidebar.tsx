'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import { WorkspaceSwitcher } from './workspace-switcher'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '',              label: 'Dashboard',   icon: LayoutGrid,  proOnly: false },
  { href: '/calendar',     label: 'Calendar',    icon: Calendar,    proOnly: false },
  { href: '/compose',      label: 'Compose',     icon: PenSquare,   proOnly: false },
  { href: '/inbox',        label: 'Inbox',       icon: MessageSquare, proOnly: false },
  { href: '/brand',        label: 'Brand AI',    icon: Zap,         proOnly: false },
  { href: '/competitors',  label: 'Competitors', icon: Crosshair,   proOnly: true  },
  { href: '/analytics',    label: 'Analytics',   icon: BarChart3,   proOnly: false },
  { href: '/seo',          label: 'SEO',         icon: Search,      proOnly: false },
]

export function Sidebar({ workspaceId, brandReady, plan }: { workspaceId: string; brandReady: boolean; plan?: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}`

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col h-screen bg-background-secondary border-r border-background-border shrink-0 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-background-border shrink-0">
        <AnimatePresence mode="wait">
          {!collapsed ? (
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

      {/* Workspace Switcher */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-background-border">
          <WorkspaceSwitcher workspaceId={workspaceId} />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, proOnly }) => {
          const isBrandAI = href === '/brand'
          const locked = (isBrandAI && !brandReady) || (proOnly && plan === 'STARTER')

          if (locked) {
            const lockTitle = isBrandAI
              ? 'Connect your website and a social account to unlock Brand AI'
              : 'Upgrade to PRO or AGENCY to unlock this feature'
            return (
              <Link
                key={label}
                href={`${base}/settings`}
                title={lockTitle}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-tertiary hover:bg-background-hover transition-all duration-150"
                aria-label={collapsed ? `${label} (locked)` : undefined}
              >
                <Lock size={16} className="shrink-0" strokeWidth={1.5} />
                <AnimatePresence>
                  {!collapsed && (
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
          const isActive =
            pathname === fullHref || (href !== '' && pathname.startsWith(fullHref))
          return (
            <Link
              key={label}
              href={fullHref}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group',
                isActive
                  ? 'bg-background-hover text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-hover',
              )}
              aria-label={collapsed ? label : undefined}
            >
              <Icon size={16} className="shrink-0" strokeWidth={isActive ? 2 : 1.5} />
              <AnimatePresence>
                {!collapsed && (
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
        })}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-background-border p-2 space-y-0.5">
        <Link
          href={`${base}/settings`}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover transition-all duration-150"
          aria-label={collapsed ? 'Settings' : undefined}
        >
          <Settings size={16} strokeWidth={1.5} className="shrink-0" />
          {!collapsed && <span className="tracking-wide">Settings</span>}
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-background-tertiary border border-background-border flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors z-10 cursor-pointer"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  )
}
