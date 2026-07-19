'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Menu, Zap } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UpgradeModal } from '@/components/lyra/billing/upgrade-modal'

const PAGE_TITLES: [RegExp, string][] = [
  [/\/calendar$/,    'Calendar'],
  [/\/compose$/,     'Compose'],
  [/\/inbox$/,       'Inbox'],
  [/\/brand$/,       'Brand AI'],
  [/\/analytics$/,   'Analytics'],
  [/\/settings$/,    'Settings'],
  [/\/seo$/,         'SEO'],
  [/\/assistant$/,   'Assistant'],
  [/\/trends$/,      'Trends'],
  [/\/competitors$/, 'Competitors'],
  [/\/repurpose$/,   'Repurpose'],
  [/\/agency\/clients\/new$/, 'New workspace'],
  [/\/agency\/clients/,       'Clients'],
  [/\/agency\/settings/,      'Agency'],
  [/\/account/,               'Account'],
  [/\/workspace\/[^/]+$/,     'Dashboard'],
]

function getPageTitle(path: string): string {
  for (const [pattern, label] of PAGE_TITLES) {
    if (pattern.test(path)) return label
  }
  return 'LYRA'
}

interface HeaderProps {
  user: { name?: string | null; email: string; avatarUrl?: string | null }
  plan?: string
  onMenuOpen?: () => void
}

export function Header({ user, plan, onMenuOpen }: HeaderProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const showUpgrade = plan === 'STARTER' || plan === 'PRO'
  const showManage = plan === 'AGENCY'
  const mobileTitle = getPageTitle(pathname)

  return (
    <>
      <header className="h-14 md:h-16 flex items-center justify-between px-4 md:px-6 border-b border-background-border bg-background-secondary shrink-0 gap-3">

        {/* Left — hamburger (mobile) + page title (mobile) */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuOpen}
            className="lg:hidden -ml-2 h-11 w-11 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-silver"
            aria-label="Open navigation"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>

          {/* Mobile page title */}
          <span className="lg:hidden font-sans text-sm font-medium text-text-secondary tracking-widest uppercase truncate">
            {mobileTitle}
          </span>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2 shrink-0">
          {showUpgrade && (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-silver/40 font-sans text-xs font-medium text-accent-silver hover:border-accent-silver hover:text-text-primary transition-colors duration-150"
            >
              <Zap size={11} strokeWidth={2} />
              Upgrade
            </button>
          )}
          {showManage && (
            <Link
              href="/account"
              className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg border border-background-border font-sans text-xs font-medium text-text-tertiary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150"
            >
              Agency Plan
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-10 w-10 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-silver rounded-full cursor-pointer bg-transparent border-0 p-0"
              aria-label="User menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatarUrl ?? undefined} />
                <AvatarFallback className="bg-background-tertiary text-text-secondary text-xs">
                  {user.name?.[0] ?? user.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-48 bg-background-tertiary border-background-border"
            >
              <div className="px-2 py-1.5">
                <p className="text-xs text-text-secondary">{user.name}</p>
                <p className="text-xs text-text-tertiary truncate">{user.email}</p>
              </div>

              {showUpgrade && (
                <>
                  <DropdownMenuSeparator className="bg-background-border" />
                  <DropdownMenuItem
                    className="text-accent-silver cursor-pointer sm:hidden"
                    onClick={() => setUpgradeOpen(true)}
                  >
                    <Zap size={12} strokeWidth={2} className="mr-2" />
                    Upgrade plan
                  </DropdownMenuItem>
                </>
              )}
              {showManage && (
                <>
                  <DropdownMenuSeparator className="bg-background-border" />
                  <DropdownMenuItem
                    className="text-text-secondary cursor-pointer sm:hidden"
                    onClick={() => router.push('/account')}
                  >
                    Agency Plan
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator className="bg-background-border" />

              <DropdownMenuItem
                className="text-text-secondary cursor-pointer"
                onClick={() => router.push('/account')}
              >
                Account
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-background-border" />

              <DropdownMenuItem
                className="text-status-error cursor-pointer"
                onClick={() => { window.location.href = '/auth/logout' }}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {showUpgrade && (
        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          currentPlan={plan!}
        />
      )}
    </>
  )
}
