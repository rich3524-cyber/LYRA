'use client'

import { useState } from 'react'
import { Mail, Loader2, RefreshCw, Link2Off, CheckCircle, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type Provider = 'KLAVIYO' | 'MAILCHIMP'

interface EmailConnection {
  id:           string
  provider:     Provider
  isActive:     boolean
  lastSyncAt:   string | null
  lastSyncError: string | null
}

const PROVIDERS: { value: Provider; label: string; description: string }[] = [
  {
    value: 'KLAVIYO',
    label: 'Klaviyo',
    description: 'Enter your Klaviyo Private API Key from Account → API Keys.',
  },
  {
    value: 'MAILCHIMP',
    label: 'Mailchimp',
    description: 'Enter your Mailchimp API key (e.g. abc123-us6). The server prefix is detected automatically.',
  },
]

export function EmailMarketingSection({
  workspaceId,
  initialConnection,
}: {
  workspaceId: string
  initialConnection: EmailConnection | null
}) {
  const [connection, setConnection] = useState<EmailConnection | null>(initialConnection)
  const [selectedProvider, setSelectedProvider] = useState<Provider>('KLAVIYO')
  const [apiKey, setApiKey] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setError(null)
    if (!apiKey.trim()) { setError('API key is required.'); return }
    setIsConnecting(true)
    try {
      const res = await fetch('/api/email/connect', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, provider: selectedProvider, apiKey: apiKey.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Connection failed.'); return }
      setConnection(data.connection)
      setApiKey('')
    } catch {
      setError('Unable to connect. Check your connection and try again.')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleSync() {
    setError(null)
    setIsSyncing(true)
    try {
      const res = await fetch('/api/email/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Sync failed.'); return }
      setConnection(prev => prev ? { ...prev, lastSyncAt: data.lastSyncAt, lastSyncError: null } : prev)
    } catch {
      setError('Sync failed. Check your connection and try again.')
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleDisconnect() {
    setError(null)
    setIsDisconnecting(true)
    try {
      const res = await fetch('/api/email/connect', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId }),
      })
      if (!res.ok) { setError('Disconnect failed.'); return }
      setConnection(null)
    } catch {
      setError('Disconnect failed. Try again.')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const providerLabel = connection
    ? PROVIDERS.find(p => p.value === connection.provider)?.label ?? connection.provider
    : null

  return (
    <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="flex items-center gap-2">
        <Mail size={15} strokeWidth={1.5} className="text-text-secondary" />
        <p className="font-sans text-sm font-medium text-text-primary">Email Marketing</p>
      </div>

      {connection ? (
        /* ── Connected state ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-status-success" />
                <span className="font-sans text-sm text-text-primary">{providerLabel}</span>
              </div>
              {connection.lastSyncAt && (
                <p className="font-sans text-xs text-text-tertiary pl-3.5">
                  Last synced {formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })}
                </p>
              )}
              {!connection.lastSyncAt && (
                <p className="font-sans text-xs text-text-tertiary pl-3.5">
                  Initial sync in progress.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                aria-label="Sync now"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium text-text-secondary bg-background-tertiary border border-background-border-mid hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} strokeWidth={1.5} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Syncing' : 'Sync now'}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="inline-flex items-center gap-1 text-xs font-sans text-text-tertiary hover:text-status-error transition-colors disabled:opacity-50"
              >
                <Link2Off size={12} strokeWidth={1.5} />
                {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>

          {/* Sync error */}
          {connection.lastSyncError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-status-error/5 border border-status-error/20">
              <AlertCircle size={13} strokeWidth={1.5} className="text-status-error shrink-0 mt-0.5" />
              <p className="font-sans text-xs text-status-error leading-relaxed">
                Last sync failed: {connection.lastSyncError}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── Disconnected state ── */
        <div className="space-y-4">
          <p className="font-sans text-xs text-text-tertiary leading-relaxed">
            Connect your email marketing platform to see scheduled and sent campaigns on the LYRA calendar.
          </p>

          {/* Provider selector */}
          <div>
            <label className="block font-sans text-xs font-medium text-text-secondary mb-2">
              Platform
            </label>
            <div className="flex gap-2 flex-wrap">
              {PROVIDERS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setSelectedProvider(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-all border
                    ${selectedProvider === p.value
                      ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                      : 'bg-background-tertiary text-text-secondary border-background-border-mid hover:text-text-primary'
                    }`}
                >
                  {p.label}
                </button>
              ))}
              <span className="px-3 py-1.5 rounded-lg text-xs font-sans text-text-tertiary border border-background-border border-dashed">
                More coming soon
              </span>
            </div>
          </div>

          {/* Credential fields */}
          <div>
            <label className="block font-sans text-xs font-medium text-text-secondary mb-1.5">
              {PROVIDERS.find(p => p.value === selectedProvider)?.label} API Key
            </label>
            <p className="font-sans text-xs text-text-tertiary mb-2">
              {PROVIDERS.find(p => p.value === selectedProvider)?.description}
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={selectedProvider === 'KLAVIYO' ? 'pk_live_...' : 'abc123...-us6'}
              className="w-full px-3 py-2.5 rounded-lg bg-background-primary border border-background-border text-text-primary text-sm font-mono placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-secondary transition-colors"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="font-sans text-xs text-status-error">{error}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-sans font-medium bg-accent-platinum text-background-primary hover:bg-accent-white transition-colors disabled:opacity-50"
          >
            {isConnecting ? (
              <><Loader2 size={12} strokeWidth={1.5} className="animate-spin" />Connecting</>
            ) : (
              <><CheckCircle size={12} strokeWidth={1.5} />Connect</>
            )}
          </button>
        </div>
      )}

      {/* Error from sync/disconnect */}
      {error && connection && (
        <p className="font-sans text-xs text-status-error">{error}</p>
      )}
    </div>
  )
}
