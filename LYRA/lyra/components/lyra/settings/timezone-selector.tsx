'use client'

import { useState, useTransition, useMemo } from 'react'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface Props {
  workspaceId: string
  currentTimezone: string
}

function getTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore',
      'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland']
  }
}

function formatTimezone(tz: string): string {
  try {
    const now = new Date()
    const offset = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? ''
    return `${tz.replace(/_/g, ' ')} (${offset})`
  } catch {
    return tz
  }
}

export function TimezoneSelector({ workspaceId, currentTimezone }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(currentTimezone || 'UTC')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const timezones = useMemo(() => getTimezones(), [])

  function handleSelect(tz: string) {
    setOpen(false)
    if (tz === selected) return
    const previous = selected
    setSelected(tz)
    setSaved(false)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: tz }),
        })
        if (!res.ok) {
          setSelected(previous)
          toast.error('Failed to save timezone')
          return
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch {
        setSelected(previous)
        toast.error('Failed to save timezone')
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Globe size={16} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
        <div className="min-w-0">
          <p className="font-sans text-sm text-text-primary">
            {formatTimezone(selected)}
          </p>
          {saved && (
            <p className="font-sans text-xs text-status-success">Saved</p>
          )}
          {isPending && (
            <p className="font-sans text-xs text-text-tertiary">Saving...</p>
          )}
        </div>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-expanded={open}
          aria-label="Select timezone"
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-sans font-medium bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver transition-colors"
        >
          Change
          <ChevronsUpDown size={12} strokeWidth={1.5} />
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 bg-background-secondary border-background-border" align="end">
          <Command className="bg-transparent">
            <CommandInput
              placeholder="Search timezone..."
              className="font-sans text-sm text-text-primary placeholder:text-text-tertiary border-b border-background-border"
            />
            <CommandList className="max-h-64">
              <CommandEmpty className="py-4 text-center font-sans text-xs text-text-tertiary">
                No timezone found.
              </CommandEmpty>
              <CommandGroup>
                {timezones.map((tz) => (
                  <CommandItem
                    key={tz}
                    value={tz}
                    onSelect={() => handleSelect(tz)}
                    className="font-sans text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    <Check
                      size={12}
                      strokeWidth={2}
                      className={cn('mr-2 shrink-0', tz === selected ? 'opacity-100 text-accent-platinum' : 'opacity-0')}
                    />
                    {tz.replace(/_/g, ' ')}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
