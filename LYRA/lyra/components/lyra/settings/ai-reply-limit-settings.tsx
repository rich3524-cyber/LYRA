'use client'

import { useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import { toast } from 'sonner'

interface AiReplyLimitSettingsProps {
  workspaceId: string
  maxAiRepliesPerThread: number
  canManage: boolean
}

// 0 is a real, meaningful value here (no limit), not an empty input -- which
// is why the floor is 0 rather than 1. Ceiling matches the server-side bound
// in app/api/workspaces/[id]/route.ts.
const MIN_REPLIES = 0
const MAX_REPLIES = 20

export function AiReplyLimitSettings({
  workspaceId,
  maxAiRepliesPerThread,
  canManage,
}: AiReplyLimitSettingsProps) {
  const [limit, setLimit] = useState(String(maxAiRepliesPerThread))
  const [saving, setSaving] = useState(false)

  async function save() {
    const value = Number(limit)
    if (!Number.isInteger(value) || value < MIN_REPLIES || value > MAX_REPLIES) {
      toast.error(`Enter a whole number between ${MIN_REPLIES} and ${MAX_REPLIES}.`)
      setLimit(String(maxAiRepliesPerThread))
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ maxAiRepliesPerThread: value }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      toast.success('Reply limit updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
      setLimit(String(maxAiRepliesPerThread))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="flex gap-3">
        <MessagesSquare className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <p className="font-sans text-sm font-medium text-text-primary">Replies per conversation</p>
          <p className="font-sans text-sm text-text-secondary mt-1">
            Caps how many times the AI replies to one customer under a single post. At the limit, the
            conversation moves to your Inbox for a human reply. Your own replies are never counted.
          </p>
        </div>
      </div>

      <div className="space-y-2 pl-7">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="ai-reply-limit" className="font-sans text-xs text-text-secondary">
            Maximum AI replies
          </label>
          <input
            id="ai-reply-limit"
            type="number"
            min={MIN_REPLIES}
            max={MAX_REPLIES}
            value={limit}
            disabled={!canManage || saving}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => {
              if (limit !== String(maxAiRepliesPerThread)) void save()
            }}
            className="w-20 h-8 px-3 rounded-lg bg-background-tertiary border border-background-border text-text-primary font-mono text-xs focus:outline-none focus:border-background-border-mid transition-colors disabled:opacity-40"
          />
        </div>
        <p className="font-sans text-xs text-text-tertiary">
          Set to 0 to remove the limit.
        </p>
      </div>
    </div>
  )
}
