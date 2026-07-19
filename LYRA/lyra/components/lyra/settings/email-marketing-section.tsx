'use client'

import { useState, useEffect } from 'react'
import { Link2, Link2Off, RefreshCw, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Integration = {
  id: string
  provider: 'KLAVIYO' | 'MAILCHIMP' | 'CUSTOMER_IO'
  accountName: string | null
  lastSyncAt: string | null
}

const PROVIDERS: Array<{
  key: 'KLAVIYO' | 'MAILCHIMP' | 'CUSTOMER_IO'
  label: string
  color: string
  hint: string
}> = [
  {
    key: 'KLAVIYO',
    label: 'Klaviyo',
    color: '#fd6f44',
    hint: 'Find your Private API key in Klaviyo → Account → Settings → API Keys.',
  },
  {
    key: 'MAILCHIMP',
    label: 'Mailchimp',
    color: '#ffe01b',
    hint: 'Find your API key in Mailchimp → Account → Profile → Extras → API Keys. Must end in -us1, -us2, etc.',
  },
  {
    key: 'CUSTOMER_IO',
    label: 'Customer.io',
    color: '#52c8a1',
    hint: 'Find your App API Key in Customer.io → Settings → API Credentials.',
  },
]

export function EmailMarketingSection({ workspaceId }: { workspaceId: string }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch(`/api/email-integrations?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data: Integration[]) => setIntegrations(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [workspaceId])

  function getIntegration(provider: string) {
    return integrations.find((i) => i.provider === provider) ?? null
  }

  async function handleConnect(provider: string) {
    const key = apiKeys[provider]?.trim()
    if (!key) {
      toast.error('Paste your API key first')
      return
    }
    setConnecting(provider)
    try {
      const res = await fetch('/api/email-integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, provider, apiKey: key }),
      })
      const data = await res.json() as { error?: string; id?: string; accountName?: string }
      if (!res.ok) throw new Error(data.error ?? 'Connect failed')
      setApiKeys((prev) => ({ ...prev, [provider]: '' }))
      toast.success(`${provider} connected — syncing campaigns in the background`)
      // Refresh integrations list
      const updated = await fetch(`/api/email-integrations?workspaceId=${workspaceId}`).then((r) => r.json()) as Integration[]
      setIntegrations(Array.isArray(updated) ? updated : [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setConnecting(null)
    }
  }

  async function handleDisconnect(id: string, provider: string) {
    try {
      await fetch(`/api/email-integrations/${id}`, { method: 'DELETE' })
      setIntegrations((prev) => prev.filter((i) => i.id !== id))
      toast.success(`${provider} disconnected`)
    } catch {
      toast.error('Disconnect failed')
    }
  }

  async function handleSync(id: string) {
    setSyncing(id)
    try {
      const res = await fetch(`/api/email-integrations/${id}/sync`, { method: 'POST' })
      const data = await res.json() as { synced?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      toast.success(`Synced ${data.synced ?? 0} campaign${data.synced === 1 ? '' : 's'}`)
      const updated = await fetch(`/api/email-integrations?workspaceId=${workspaceId}`).then((r) => r.json()) as Integration[]
      setIntegrations(Array.isArray(updated) ? updated : [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(null)
    }
  }

  return (
    <section className="space-y-3">
      <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
        Email Marketing
      </p>
      <p className="font-sans text-xs text-text-tertiary leading-relaxed -mt-1">
        Read-only. Scheduled campaigns appear in the Content Calendar alongside your social posts.
      </p>

      <div className="space-y-2">
        {PROVIDERS.map(({ key, label, color, hint }) => {
          const integration = getIntegration(key)
          const isConnecting = connecting === key
          const isSyncing = syncing === integration?.id

          return (
            <div
              key={key}
              className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-sans text-sm font-medium text-text-primary">{label}</p>
                    {integration && (
                      <p className="font-sans text-xs text-text-tertiary">{integration.accountName}</p>
                    )}
                  </div>
                </div>

                {integration ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleSync(integration.id)}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                      aria-label="Sync now"
                    >
                      <RefreshCw
                        size={12}
                        strokeWidth={1.5}
                        className={cn(isSyncing && 'animate-spin')}
                      />
                      Sync
                    </button>
                    <button
                      onClick={() => handleDisconnect(integration.id, label)}
                      className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-status-error transition-colors"
                    >
                      <Link2Off size={12} strokeWidth={1.5} />
                      Disconnect
                    </button>
                  </div>
                ) : null}
              </div>

              {integration ? (
                <p className="font-sans text-[11px] text-text-tertiary">
                  {integration.lastSyncAt
                    ? `Last synced ${new Date(integration.lastSyncAt).toLocaleString()}`
                    : 'Sync pending…'}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="font-sans text-[11px] text-text-tertiary leading-relaxed">{hint}</p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey[key] ? 'text' : 'password'}
                        placeholder="Paste API key…"
                        value={apiKeys[key] ?? ''}
                        onChange={(e) =>
                          setApiKeys((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full h-8 px-3 pr-8 rounded-lg bg-background-tertiary border border-background-border text-text-primary font-mono text-xs placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowKey((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                        aria-label={showKey[key] ? 'Hide key' : 'Show key'}
                      >
                        {showKey[key] ? (
                          <EyeOff size={12} strokeWidth={1.5} />
                        ) : (
                          <Eye size={12} strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => handleConnect(key)}
                      disabled={isConnecting || !apiKeys[key]?.trim()}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-sans font-medium transition-all duration-150 bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {isConnecting ? (
                        <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                      ) : (
                        <Link2 size={12} strokeWidth={1.5} />
                      )}
                      Connect
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
