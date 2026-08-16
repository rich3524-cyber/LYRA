import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

export default function OnboardSuccessPage() {
  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-status-success/10 border border-status-success/20 flex items-center justify-center">
            <CheckCircle size={28} strokeWidth={1.5} className="text-status-success" />
          </div>
        </div>

        <h1 className="font-display text-[32px] leading-[1.2] text-text-primary mb-3">
          You&apos;re all set.
        </h1>

        <p className="font-sans text-sm text-text-secondary leading-relaxed mb-8">
          Your 14-day free trial has started. LYRA is setting up your workspace — it will be ready when you enter.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 px-6 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium transition-opacity duration-150 hover:opacity-80"
        >
          Enter LYRA →
        </Link>

        <p className="font-sans text-xs text-text-tertiary mt-6">
          A receipt has been sent to your email. Card will be charged after your 14-day trial.
        </p>
      </div>
    </div>
  )
}
