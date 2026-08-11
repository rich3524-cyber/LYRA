'use client'

import { useState } from 'react'
import { Clock } from 'lucide-react'
import { toast } from 'sonner'

interface ApprovalSlaSettingsProps {
  workspaceId: string
  approvalSlaHours: number
  approvalSlaUnscheduledHours: number
  canManage: boolean
}

const MIN_HOURS = 1
const MAX_HOURS = 720

export function ApprovalSlaSettings({
  workspaceId,
  approvalSlaHours,
  approvalSlaUnscheduledHours,
  canManage,
}: ApprovalSlaSettingsProps) {
  const [scheduled, setScheduled] = useState(String(approvalSlaHours))
  const [unscheduled, setUnscheduled] = useState(String(approvalSlaUnscheduledHours))
  const [saving, setSaving] = useState(false)

  async function save(field: 'approvalSlaHours' | 'approvalSlaUnscheduledHours', raw: string, reset: () => void) {
    const value = Number(raw)
    if (!Number.isInteger(value) || value < MIN_HOURS || value > MAX_HOURS) {
      toast.error(`Enter a whole number of hours between ${MIN_HOURS} and ${MAX_HOURS}.`)
      reset()
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [field]: value }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      toast.success('Approval deadline updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="flex gap-3">
        <Clock className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <p className="font-sans text-sm font-medium text-text-primary">Approval deadlines</p>
          <p className="font-sans text-sm text-text-secondary mt-1">
            A post still waiting for approval past its deadline is flagged in the calendar, and alerts your
            notification channel once.
          </p>
        </div>
      </div>

      <div className="space-y-3 pl-7">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="sla-scheduled" className="font-sans text-xs text-text-secondary">
            Hours before a post&apos;s scheduled time
          </label>
          <input
            id="sla-scheduled"
            type="number"
            min={MIN_HOURS}
            max={MAX_HOURS}
            value={scheduled}
            disabled={!canManage || saving}
            onChange={(e) => setScheduled(e.target.value)}
            onBlur={() => {
              if (scheduled !== String(approvalSlaHours)) {
                void save('approvalSlaHours', scheduled, () => setScheduled(String(approvalSlaHours)))
              }
            }}
            className="w-20 h-8 px-3 rounded-lg bg-background-tertiary border border-background-border text-text-primary font-mono text-xs focus:outline-none focus:border-background-border-mid transition-colors disabled:opacity-40"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <label htmlFor="sla-unscheduled" className="font-sans text-xs text-text-secondary">
            Hours since submission, if no time is set
          </label>
          <input
            id="sla-unscheduled"
            type="number"
            min={MIN_HOURS}
            max={MAX_HOURS}
            value={unscheduled}
            disabled={!canManage || saving}
            onChange={(e) => setUnscheduled(e.target.value)}
            onBlur={() => {
              if (unscheduled !== String(approvalSlaUnscheduledHours)) {
                void save('approvalSlaUnscheduledHours', unscheduled, () =>
                  setUnscheduled(String(approvalSlaUnscheduledHours))
                )
              }
            }}
            className="w-20 h-8 px-3 rounded-lg bg-background-tertiary border border-background-border text-text-primary font-mono text-xs focus:outline-none focus:border-background-border-mid transition-colors disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  )
}
