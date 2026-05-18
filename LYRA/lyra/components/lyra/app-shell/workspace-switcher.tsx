'use client'

import { useState, useEffect } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface Workspace {
  id: string
  name: string
}

export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [current, setCurrent] = useState<Workspace | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => r.json())
      .then((data: Workspace[]) => {
        setWorkspaces(data)
        setCurrent(data.find((w) => w.id === workspaceId) ?? null)
      })
      .catch(() => {
        // Silently ignore — workspaces API not yet configured
      })
  }, [workspaceId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Base UI Trigger — no asChild; render props directly on trigger */}
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        aria-label="Switch workspace"
        className="w-full flex justify-between items-center text-text-secondary hover:text-text-primary text-xs h-8 px-2 rounded-md hover:bg-background-hover transition-colors bg-transparent border-0 cursor-pointer"
      >
        <span className="truncate">{current?.name ?? 'Select workspace'}</span>
        <ChevronsUpDown size={12} className="shrink-0 ml-1 opacity-50" />
      </PopoverTrigger>

      <PopoverContent className="w-56 p-0 bg-background-tertiary border-background-border">
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Search workspaces..."
            className="text-xs text-text-secondary"
          />
          <CommandEmpty className="text-xs text-text-tertiary py-3 text-center">
            No workspaces found.
          </CommandEmpty>
          <CommandGroup>
            {workspaces.map((w) => (
              <CommandItem
                key={w.id}
                value={w.name}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/workspace/${w.id}`)
                }}
                className="text-xs text-text-secondary cursor-pointer"
              >
                <Check
                  size={12}
                  className={cn('mr-2', w.id === workspaceId ? 'opacity-100' : 'opacity-0')}
                />
                {w.name}
              </CommandItem>
            ))}
          </CommandGroup>

          <div className="border-t border-background-border p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs text-text-tertiary hover:text-text-primary gap-2"
              onClick={() => router.push('/agency/clients/new')}
            >
              <Plus size={12} />
              New workspace
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
