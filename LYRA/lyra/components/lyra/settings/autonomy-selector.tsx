'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

type AutonomyMode = 'OFF' | 'DRAFT_APPROVE' | 'FULL'

interface AutonomyOption {
  mode: AutonomyMode
  title: string
  description: string
}

const OPTIONS: AutonomyOption[] = [
  {
    mode: 'OFF',
    title: 'No reply',
    description: "Comments aren't answered automatically. Review and respond manually in the Inbox.",
  },
  {
    mode: 'DRAFT_APPROVE',
    title: 'Post with approval',
    description: 'AI drafts a reply for each comment. Nothing goes live until you approve it in the Inbox.',
  },
  {
    mode: 'FULL',
    title: 'Full Automatic',
    description: 'AI replies to comments instantly with no review.',
  },
]

interface AutonomySelectorProps {
  workspaceId: string
  currentMode: AutonomyMode
  isPro: boolean
}

export function AutonomySelector({ workspaceId, currentMode, isPro }: AutonomySelectorProps) {
  const [mode, setMode] = useState(currentMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function applyMode(nextMode: AutonomyMode) {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiResponseMode: nextMode }),
      })
      if (res.ok) {
        setMode(nextMode)
      } else {
        setError('Failed to update. Try again.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleSelect(nextMode: AutonomyMode) {
    if (nextMode === mode || saving || confirmOpen) return
    if (nextMode === 'FULL') {
      setConfirmOpen(true)
      return
    }
    void applyMode(nextMode)
  }

  function handleConfirmFull() {
    setConfirmOpen(false)
    void applyMode('FULL')
  }

  return (
    <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
      <div className="flex gap-3">
        <Bot className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium font-sans text-text-primary">AI Response Mode</p>
          <p className="text-sm font-sans text-text-secondary mt-1">
            Controls how LYRA&apos;s AI responds to comments on your connected accounts.
          </p>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        {OPTIONS.map((option) => {
          const selected = option.mode === mode
          const disabled = (option.mode === 'FULL' || option.mode === 'DRAFT_APPROVE') && !isPro

          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => handleSelect(option.mode)}
              disabled={disabled || saving}
              className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                selected
                  ? 'border-accent-silver bg-background-tertiary'
                  : 'border-background-border-mid hover:border-accent-silver'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span
                className={`mt-0.5 h-4 w-4 rounded-full border shrink-0 flex items-center justify-center ${
                  selected ? 'border-accent-silver' : 'border-background-border-mid'
                }`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-accent-silver" />}
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-medium font-sans text-text-primary">
                  {option.title}
                </span>
                <span className="block text-xs font-sans text-text-tertiary leading-relaxed">
                  {option.description}
                </span>
                {(option.mode === 'FULL' || option.mode === 'DRAFT_APPROVE') && !isPro && (
                  <span className="block text-xs font-sans text-text-tertiary mt-1">
                    Requires Pro or Agency plan.
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {error && <p className="text-xs font-sans text-status-error">{error}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-background-secondary border border-background-border-mid rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans text-base font-medium text-text-primary">
              Switch to Full Automatic?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm text-text-secondary leading-relaxed">
              AI will reply to comments publicly with no review. You can switch back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans text-sm">
              Cancel
            </AlertDialogCancel>
            <button
              onClick={handleConfirmFull}
              disabled={saving}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-sans text-sm bg-status-success text-background-primary hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Enable Full Automatic
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
