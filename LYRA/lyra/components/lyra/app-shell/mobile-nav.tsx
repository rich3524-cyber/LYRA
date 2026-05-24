'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid,
  Calendar,
  PenSquare,
  MessageSquare,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mobileNavItems = [
  { href: '',          label: 'Home',     icon: LayoutGrid    },
  { href: '/calendar', label: 'Calendar', icon: Calendar      },
  { href: '/compose',  label: 'Compose',  icon: PenSquare     },
  { href: '/inbox',    label: 'Inbox',    icon: MessageSquare },
  { href: '/brand',    label: 'Brand AI', icon: Zap           },
]

export function MobileNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname()
  const base = `/workspace/${workspaceId}`

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden z-40 flex items-center justify-around h-16 bg-background-secondary border-t border-background-border">
      {mobileNavItems.map(({ href, label, icon: Icon }) => {
        const fullHref = `${base}${href}`
        const isActive =
          pathname === fullHref || (href !== '' && pathname.startsWith(fullHref))

        return (
          <Link
            key={label}
            href={fullHref}
            className={cn(
              'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors duration-150',
              isActive ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
            )}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              size={20}
              strokeWidth={isActive ? 2 : 1.5}
              className={cn(isActive && 'text-accent-platinum')}
            />
            <span className="font-sans text-[10px] font-medium tracking-wide">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
