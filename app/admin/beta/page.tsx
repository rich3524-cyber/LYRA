import { redirect } from 'next/navigation'
import Image from 'next/image'
import { format } from 'date-fns'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { BetaResponse, FeedbackResponse } from '@prisma/client'

const DISAPPOINTMENT_LABELS = { VERY: 'Very disappointed', SOMEWHAT: 'Somewhat disappointed', NOT: 'Not disappointed' }
const TIME_SAVED_LABELS = { SIGNIFICANT: 'Saved significant time', SOME: 'Saved some time', NONE: 'No difference', MORE_WORK: 'Created more work' }
const WOULD_PAY_LABELS = { YES: 'Yes', NO: 'No', MAYBE: 'Maybe' }
const FEEDBACK_TYPE_LABELS = { BUG_REPORT: 'Bug report', FEATURE_REQUEST: 'Feature request', GENERAL: 'General feedback', PRAISE: 'Praise' }
const FEEDBACK_TYPE_COLOURS: Record<string, string> = {
  BUG_REPORT:      'text-status-error bg-status-error/10',
  FEATURE_REQUEST: 'text-status-info bg-status-info/10',
  GENERAL:         'text-text-secondary bg-background-hover',
  PRAISE:          'text-status-success bg-status-success/10',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-background-border last:border-0">
      <span className="text-xs font-sans text-text-secondary w-48 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-sans text-text-primary leading-relaxed">{value ?? <span className="text-text-tertiary">—</span>}</span>
    </div>
  )
}

function BetaCard({ r }: { r: BetaResponse }) {
  return (
    <div className="bg-background-secondary border border-background-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-sans font-medium text-text-primary">{r.name}</p>
          {r.email && <p className="text-xs font-sans text-text-secondary mt-0.5">{r.email}</p>}
        </div>
        <span className="text-xs font-mono text-text-tertiary shrink-0 ml-4">
          {format(r.createdAt, 'dd MMM yyyy, HH:mm')}
        </span>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <span className={`px-2.5 py-1 rounded-md text-xs font-sans font-medium ${
          r.disappointmentScore === 'VERY' ? 'text-status-success bg-status-success/10' :
          r.disappointmentScore === 'SOMEWHAT' ? 'text-status-warning bg-status-warning/10' :
          'text-status-error bg-status-error/10'
        }`}>
          {DISAPPOINTMENT_LABELS[r.disappointmentScore]}
        </span>
        <span className={`px-2.5 py-1 rounded-md text-xs font-sans font-medium ${
          r.wouldPay === 'YES' ? 'text-status-success bg-status-success/10' :
          r.wouldPay === 'MAYBE' ? 'text-status-warning bg-status-warning/10' :
          'text-status-error bg-status-error/10'
        }`}>
          Would pay: {WOULD_PAY_LABELS[r.wouldPay]}
        </span>
        <span className="px-2.5 py-1 rounded-md text-xs font-mono text-text-secondary bg-background-hover">
          NPS {r.npsScore}/10
        </span>
        <span className="px-2.5 py-1 rounded-md text-xs font-mono text-text-secondary bg-background-hover">
          Voice {r.aiVoiceScore}/5
        </span>
      </div>

      <div className="divide-y divide-background-border">
        <Row label="Time saved" value={TIME_SAVED_LABELS[r.timeSavedScore]} />
        {r.alternativeTool && <Row label="Would use instead" value={r.alternativeTool} />}
        {r.mostUsedFeature && <Row label="Most used feature" value={r.mostUsedFeature} />}
        {r.unusedFeatures && <Row label="Unused features" value={r.unusedFeatures} />}
        {r.confusingPart && <Row label="Most confusing" value={r.confusingPart} />}
        {r.missingFeature && <Row label="Missing feature" value={r.missingFeature} />}
        {(r.priceTooExpensive != null || r.priceCheap != null) && (
          <Row
            label="Pricing (AUD/mo)"
            value={`Too expensive: ${r.priceTooExpensive != null ? `$${r.priceTooExpensive}` : '—'} · Too cheap: ${r.priceCheap != null ? `$${r.priceCheap}` : '—'}`}
          />
        )}
      </div>
    </div>
  )
}

function FeedbackCard({ r }: { r: FeedbackResponse }) {
  return (
    <div className="bg-background-secondary border border-background-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-sans font-medium text-text-primary">{r.name}</p>
          <span className={`px-2 py-0.5 rounded-md text-xs font-sans font-medium ${FEEDBACK_TYPE_COLOURS[r.feedbackType]}`}>
            {FEEDBACK_TYPE_LABELS[r.feedbackType]}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-xs font-mono text-text-tertiary">
            {r.rating}/5
          </span>
          <span className="text-xs font-mono text-text-tertiary">
            {format(r.createdAt, 'dd MMM yyyy, HH:mm')}
          </span>
        </div>
      </div>
      <p className="text-sm font-sans text-text-primary leading-relaxed whitespace-pre-wrap">{r.description}</p>
    </div>
  )
}

const ADMIN_EMAILS = ['richunwin3524@gmail.com', 'hello@lyraonline.ai']

export default async function AdminBetaPage() {
  const user = await getCurrentUser()
  if (!user || !ADMIN_EMAILS.includes(user.email)) redirect('/auth/login')

  const [betaResponses, feedbackResponses] = await Promise.all([
    prisma.betaResponse.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.feedbackResponse.findMany({ orderBy: { createdAt: 'desc' } }),
  ])

  return (
    <div className="min-h-screen bg-background-primary px-6 py-12">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <Image src="/brand/lyra-logo-primary.svg" alt="LYRA" width={88} height={28} priority />
          <span className="text-[11px] font-sans font-medium uppercase tracking-[0.1em] text-text-tertiary">
            Admin
          </span>
        </div>

        <h1 className="font-display text-[40px] leading-[1.2] text-text-primary mb-2">
          Beta Responses
        </h1>
        <p className="text-text-secondary text-sm font-sans mb-12">
          {betaResponses.length} survey{betaResponses.length !== 1 ? 's' : ''} · {feedbackResponses.length} feedback submission{feedbackResponses.length !== 1 ? 's' : ''}
        </p>

        {/* Beta Survey Responses */}
        <section className="mb-12">
          <p className="text-[11px] font-sans font-medium uppercase tracking-[0.1em] text-text-secondary mb-5">
            End-of-beta survey
          </p>
          {betaResponses.length === 0 ? (
            <div className="bg-background-secondary border border-background-border rounded-xl p-8 text-center">
              <p className="text-text-tertiary text-sm font-sans">No survey responses yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {betaResponses.map(r => <BetaCard key={r.id} r={r} />)}
            </div>
          )}
        </section>

        {/* Ongoing Feedback */}
        <section className="mb-16">
          <p className="text-[11px] font-sans font-medium uppercase tracking-[0.1em] text-text-secondary mb-5">
            Ongoing feedback
          </p>
          {feedbackResponses.length === 0 ? (
            <div className="bg-background-secondary border border-background-border rounded-xl p-8 text-center">
              <p className="text-text-tertiary text-sm font-sans">No feedback submissions yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbackResponses.map(r => <FeedbackCard key={r.id} r={r} />)}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
