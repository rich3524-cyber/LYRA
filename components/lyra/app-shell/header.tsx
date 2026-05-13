'use client'

import { Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface HeaderProps {
  user: { name?: string | null; email: string; avatarUrl?: string | null }
  title: string
}

export function Header({ user, title }: HeaderProps) {
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-background-border bg-background-secondary shrink-0">
      <h1 className="text-sm font-medium text-text-secondary tracking-widest uppercase">
        {title}
      </h1>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Search"
        >
          <Search size={16} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Notifications"
        >
          <Bell size={16} />
        </Button>

        <DropdownMenu>
          {/* Base UI Trigger — no asChild; style the trigger directly */}
          <DropdownMenuTrigger
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-silver rounded-full cursor-pointer bg-transparent border-0 p-0"
            aria-label="User menu"
          >
            <Avatar className="h-7 w-7">
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

            <DropdownMenuSeparator className="bg-background-border" />

            <DropdownMenuItem
              className="text-text-secondary cursor-pointer"
              onClick={() => { window.location.href = '/account' }}
            >
              Account
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-background-border" />

            {/* Auth0 v4 logout route */}
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
  )
}
