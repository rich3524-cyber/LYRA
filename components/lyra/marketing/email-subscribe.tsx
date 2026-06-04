'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function EmailSubscribe() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'loading') return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/klaviyo/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Something went wrong. Try again.')
        setStatus('error')
      } else {
        router.push('/thank-you')
      }
    } catch {
      setErrorMsg('Something went wrong. Try again.')
      setStatus('error')
    }
  }

  return (
    <div className="w-full">
      <p className="font-sans text-xs text-text-tertiary mb-3 uppercase tracking-[0.1em]">
        Stay in the loop
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading'}
          className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-background-tertiary border border-background-border text-text-primary font-sans text-sm placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid transition-colors duration-150 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="shrink-0 h-9 px-4 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium transition-opacity duration-150 hover:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
        >
          {status === 'loading' ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : null}
          Subscribe
        </button>
      </form>
      {status === 'error' && (
        <p className="font-sans text-xs text-status-error mt-2">{errorMsg}</p>
      )}
    </div>
  )
}
