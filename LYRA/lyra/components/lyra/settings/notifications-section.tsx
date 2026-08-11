'use client'

import { useState, useEffect } from 'react'
// Lucide dropped its brand icons, so there is no Slack mark available. Lucide
// is the only permitted icon set (CLAUDE.md), so the generic message icon
// stands in rather than importing a second library for one glyph.
import { Link2Off, Send, AlertTriangle, Loader2, MessageSquare, Lock } from 'lucide-react'
import { toast } from 'sonner'
import {
  NOTIFICATION_EVENTS,
  EVENT_META,
  FAILURE_WARNING_THRESHOLD,
  type NotificationEvent,
} from '@/services/notifications/events'

type Channel = {
  id: string
  type: 'SLACK' | 'TEAMS'
  label: string | null
  enabledEvents: string[]
  lastDeliveryAt: string | null
  lastDeliveryError: string | null
  consecutiveFailures: number
}

interface NotificationsSectionProps {
  workspaceId: string
  hasAccess: boolean
  /** Owner-level roles can connect and configure; everyone else sees it read-only. */
  canManage: boolean
}

export function NotificationsSection({ workspaceId, hasAccess, canManage }: NotificationsSectionProps) {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetch(`/api/notification-channels?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Channel | null) => setChannel(data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workspaceId])

  async function handleToggleEvent(event: NotificationEvent) {
    if (!channel || saving) return
    const next = channel.enabledEvents.includes(event)
      ? channel.enabledEvents.filter((e) => e !== event)
      : [...channel.enabledEvents, event]

    const previous = channel.enabledEvents
    setChannel({ ...channel, enabledEvents: next })
    setSaving(true)
    try {
      const res = await fetch(`/api/notification-channels/${channel.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ enabledEvents: next }),
      })
      if (!res.ok) throw new Error('Save failed')
    } catch {
      // Roll the optimistic update back rather than leaving the UI claiming a
      // setting that was never persisted.
      setChannel((c) => (c ? { ...c, enabledEvents: previous } : c))
      toast.error('Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!channel) return
    setTesting(true)
    try {
      const res = await fetch(`/api/notification-channels/${channel.id}/test`, { method: 'POST' })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Test failed')
      toast.success('Test message sent')
      const updated = await fetch(`/api/notification-channels?workspaceId=${workspaceId}`).then((r) => r.json())
      setChannel(updated ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  async function handleDisconnect() {
    if (!channel) return
    try {
      const res = await fetch(`/api/notification-channels/${channel.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setChannel(null)
      toast.success('Slack disconnected')
    } catch {
      toast.error('Disconnect failed')
    }
  }

  return (
    <section className="space-y-3">
      <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
        Team Notifications
      </p>
      <p className="font-sans text-xs text-text-tertiary leading-relaxed -mt-1">
        Send alerts to a shared Slack channel so the whole team sees them at once. Email stays on regardless.
      </p>

      {loading ? (
        <div className="h-32 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
      ) : !hasAccess ? (
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border">
          <div className="flex gap-3">
            <Lock className="h-4 w-4 text-text-tertiary mt-0.5 shrink-0" strokeWidth={1.5} />
            <div>
              <p className="font-sans text-sm font-medium text-text-primary">Slack notifications</p>
              <p className="font-sans text-sm text-text-secondary mt-1">
                Included with the Agency plan, or with the Crisis Aware add-on on Pro.
              </p>
            </div>
          </div>
        </div>
      ) : !channel ? (
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
          <div className="flex gap-3">
            <MessageSquare className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
            <div>
              <p className="font-sans text-sm font-medium text-text-primary">Connect Slack</p>
              <p className="font-sans text-sm text-text-secondary mt-1">
                One channel per workspace. Public channels are joined automatically.
              </p>
              <p className="font-sans text-[11px] text-text-tertiary mt-2 leading-relaxed">
                For a private channel, run <span className="font-mono">/invite @Zernio</span> in it first — an app
                cannot add itself to a private channel.
              </p>
            </div>
          </div>
          {canManage ? (
            <a
              href={`/api/notification-channels/connect?workspaceId=${workspaceId}`}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-sans font-medium transition-all duration-150 bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver"
            >
              <MessageSquare size={12} strokeWidth={1.5} />
              Connect Slack
            </a>
          ) : (
            <p className="font-sans text-[11px] text-text-tertiary">
              Only a workspace owner or agency admin can connect a channel.
            </p>
          )}
        </div>
      ) : (
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="h-4 w-4 text-text-secondary shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-sans text-sm font-medium text-text-primary">
                  {channel.label || 'Slack channel'}
                </p>
                <p className="font-sans text-xs text-text-tertiary">
                  {channel.lastDeliveryAt
                    ? `Last delivered ${new Date(channel.lastDeliveryAt).toLocaleString()}`
                    : 'Nothing delivered yet'}
                </p>
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                  ) : (
                    <Send size={12} strokeWidth={1.5} />
                  )}
                  Send test
                </button>
                <button
                  onClick={handleDisconnect}
                  className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-status-error transition-colors"
                >
                  <Link2Off size={12} strokeWidth={1.5} />
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {channel.consecutiveFailures >= FAILURE_WARNING_THRESHOLD && (
            <div className="flex gap-2 p-3 rounded-lg bg-background-tertiary border border-background-border">
              <AlertTriangle className="h-4 w-4 text-status-warning mt-0.5 shrink-0" strokeWidth={1.5} />
              <div>
                <p className="font-sans text-xs text-text-primary">
                  {channel.consecutiveFailures} deliveries failed in a row.
                </p>
                {channel.lastDeliveryError && (
                  <p className="font-sans text-[11px] text-text-tertiary mt-1 break-words">
                    {channel.lastDeliveryError}
                  </p>
                )}
                <p className="font-sans text-[11px] text-text-tertiary mt-1">
                  Reconnect, or check the channel still exists. Email alerts are unaffected.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-1">
            {NOTIFICATION_EVENTS.map((event) => {
              const meta = EVENT_META[event]
              const on = channel.enabledEvents.includes(event)
              return (
                <div key={event} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-sans text-sm text-text-primary">{meta.label}</p>
                    <p className="font-sans text-xs text-text-tertiary mt-0.5">{meta.description}</p>
                  </div>
                  <div className="flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0">
                    <button
                      onClick={() => handleToggleEvent(event)}
                      disabled={!canManage || saving}
                      aria-label={`${on ? 'Disable' : 'Enable'} ${meta.label} notifications`}
                      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${
                        on ? 'bg-status-success' : 'bg-background-border-mid'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-text-primary transition-transform ${
                          on ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="font-sans text-[11px] text-text-tertiary leading-relaxed pt-1">
            Disconnecting removes the channel from LYRA only. The Slack app stays installed in your workspace
            until you remove it there.
          </p>
        </div>
      )}
    </section>
  )
}
