'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Page {
  id: string
  name: string
  avatarUrl: string | null
}

interface FacebookPagePickerProps {
  workspaceId: string
  pendingKey: string
}

export function FacebookPagePicker({ workspaceId, pendingKey }: FacebookPagePickerProps) {
  const router = useRouter()
  const [pages, setPages] = useState<Page[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  const fetchPages = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/facebook/pending?key=${pendingKey}`)
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to load Pages')
        return
      }
      const data = await res.json() as { pages: Page[] }
      setPages(data.pages)
      // Pre-select all pages by default
      setSelected(new Set(data.pages.map((p) => p.id)))
    } catch {
      setError('Failed to load Pages. Please try reconnecting.')
    } finally {
      setLoading(false)
    }
  }, [pendingKey])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  function togglePage(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleConnect() {
    if (selected.size === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/social/facebook/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: pendingKey, selectedPageIds: Array.from(selected) }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to connect Pages')
        return
      }
      // Success — navigate away, removing fbpending from URL
      router.replace(`/workspace/${workspaceId}/settings?connected=facebook`)
    } catch {
      setError('Connection failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    setOpen(false)
    router.replace(`/workspace/${workspaceId}/settings`)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel() }}>
      <DialogContent className="bg-background-secondary border-background-border max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-full bg-[#1877F2]/10 flex items-center justify-center flex-shrink-0">
              <Globe className="w-4 h-4 text-[#1877F2]" strokeWidth={1.5} />
            </div>
            <DialogTitle className="text-text-primary font-sans font-medium text-base">
              Choose Pages to connect
            </DialogTitle>
          </div>
          <DialogDescription className="text-text-secondary font-sans text-sm">
            Select which Globe Pages LYRA should manage. You can add more later by reconnecting.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 min-h-[120px]">
          {loading && (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-5 h-5 text-text-tertiary animate-spin" strokeWidth={1.5} />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl bg-status-error/10 border border-status-error/20 px-4 py-3">
              <p className="text-status-error font-sans text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && pages.length === 0 && (
            <div className="rounded-xl bg-background-tertiary border border-background-border px-4 py-6 text-center">
              <p className="text-text-secondary font-sans text-sm">No Pages found.</p>
              <p className="text-text-tertiary font-sans text-xs mt-1 leading-relaxed">
                Make sure all permissions were granted during the Globe login step.
              </p>
            </div>
          )}

          {!loading && !error && pages.length > 0 && (
            <div className="space-y-2">
              {pages.map((page) => {
                const isSelected = selected.has(page.id)
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => togglePage(page.id)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left',
                      isSelected
                        ? 'border-accent-platinum/40 bg-background-tertiary'
                        : 'border-background-border bg-transparent hover:bg-background-hover',
                    ].join(' ')}
                  >
                    {page.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={page.avatarUrl}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-background-border flex items-center justify-center flex-shrink-0">
                        <Globe className="w-4 h-4 text-text-tertiary" strokeWidth={1.5} />
                      </div>
                    )}
                    <span className="flex-1 font-sans text-sm text-text-primary truncate">
                      {page.name}
                    </span>
                    <div
                      className={[
                        'w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors',
                        isSelected
                          ? 'bg-accent-platinum border-accent-platinum'
                          : 'border-background-border-mid bg-transparent',
                      ].join(' ')}
                    >
                      {isSelected && <Check className="w-3 h-3 text-background-primary" strokeWidth={2} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-text-secondary hover:text-text-primary"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-accent-platinum text-background-primary hover:bg-accent-white font-sans font-medium"
            onClick={handleConnect}
            disabled={submitting || selected.size === 0 || loading}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Connecting…
              </>
            ) : (
              `Connect ${selected.size > 0 ? selected.size : ''} Page${selected.size !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
