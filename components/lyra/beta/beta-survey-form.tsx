'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Loader2 } from 'lucide-react'

type DisappointmentScore = 'VERY' | 'SOMEWHAT' | 'NOT'
type TimeSavedScore = 'SIGNIFICANT' | 'SOME' | 'NONE' | 'MORE_WORK'
type WouldPay = 'YES' | 'NO' | 'MAYBE'

interface FormState {
  name: string
  email: string
  disappointmentScore: DisappointmentScore | ''
  alternativeTool: string
  mostUsedFeature: string
  unusedFeatures: string
  aiVoiceScore: number | null
  timeSavedScore: TimeSavedScore | ''
  confusingPart: string
  missingFeature: string
  priceTooExpensive: string
  priceCheap: string
  wouldPay: WouldPay | ''
  npsScore: number | null
}

const EASING = [0.16, 1, 0.3, 1] as const

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-sans font-medium uppercase tracking-[0.1em] text-text-secondary mb-5">
      {children}
    </p>
  )
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-sm font-sans font-medium text-text-primary mb-2">
      {children}
      {optional && <span className="text-text-tertiary font-normal ml-1">(optional)</span>}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="
        w-full px-4 py-3 rounded-lg
        bg-background-secondary border border-background-border
        text-text-primary text-sm font-sans
        placeholder:text-text-tertiary
        focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
        transition-colors duration-150
      "
    />
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="
        w-full px-4 py-3 rounded-lg resize-none
        bg-background-secondary border border-background-border
        text-text-primary text-sm font-sans
        placeholder:text-text-tertiary
        focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
        transition-colors duration-150
      "
    />
  )
}

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | ''
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`
            px-4 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-150
            border focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
            ${
              value === opt.value
                ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                : 'bg-background-secondary text-text-secondary border-background-border hover:border-background-border-mid hover:text-text-primary'
            }
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ScoreRow({
  min,
  max,
  value,
  onChange,
  minLabel,
  maxLabel,
}: {
  min: number
  max: number
  value: number | null
  onChange: (v: number) => void
  minLabel?: string
  maxLabel?: string
}) {
  const scores = Array.from({ length: max - min + 1 }, (_, i) => i + min)
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap">
        {scores.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`
              w-10 h-10 rounded-lg text-sm font-mono transition-all duration-150
              border focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
              ${
                value === n
                  ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                  : 'bg-background-secondary text-text-secondary border-background-border hover:border-background-border-mid hover:text-text-primary'
              }
            `}
          >
            {n}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between mt-2">
          {minLabel && <span className="text-xs text-text-tertiary font-sans">{minLabel}</span>}
          {maxLabel && <span className="text-xs text-text-tertiary font-sans">{maxLabel}</span>}
        </div>
      )}
    </div>
  )
}

function Divider() {
  return <div className="border-t border-background-border my-8" />
}

export function BetaSurveyForm() {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    disappointmentScore: '',
    alternativeTool: '',
    mostUsedFeature: '',
    unusedFeatures: '',
    aiVoiceScore: null,
    timeSavedScore: '',
    confusingPart: '',
    missingFeature: '',
    priceTooExpensive: '',
    priceCheap: '',
    wouldPay: '',
    npsScore: null,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) { setError('Name is required.'); return }
    if (!form.disappointmentScore) { setError('Please answer the disappointment question.'); return }
    if (form.aiVoiceScore === null) { setError('Please rate the AI voice score.'); return }
    if (!form.timeSavedScore) { setError('Please answer the time saved question.'); return }
    if (!form.wouldPay) { setError('Please answer the would-you-pay question.'); return }
    if (form.npsScore === null) { setError('Please provide an NPS score.'); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          priceTooExpensive: form.priceTooExpensive !== '' ? parseFloat(form.priceTooExpensive) : null,
          priceCheap:        form.priceCheap !== '' ? parseFloat(form.priceCheap) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }
      setIsSubmitted(true)
    } catch {
      setError('Unable to submit. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background-primary px-6 py-12">
      <div className="max-w-2xl mx-auto">

        {/* Logo */}
        <div className="mb-12">
          <Image
            src="/brand/lyra-logo-primary.svg"
            alt="LYRA"
            width={88}
            height={28}
            priority
          />
        </div>

        <AnimatePresence mode="wait">
          {isSubmitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASING }}
              className="py-16"
            >
              <CheckCircle className="text-status-success mb-6" size={32} strokeWidth={1.5} />
              <h1 className="font-display text-4xl text-text-primary mb-3">
                Thank you, {form.name.split(' ')[0]}.
              </h1>
              <p className="text-text-secondary text-sm font-sans leading-relaxed">
                Your feedback has been recorded. We will review it carefully.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: EASING }}
            >
              {/* Heading */}
              <div className="mb-10">
                <h1 className="font-display text-[40px] leading-[1.2] text-text-primary mb-3">
                  Beta Feedback
                </h1>
                <p className="text-text-secondary text-sm font-sans leading-relaxed">
                  Your experience shapes what LYRA becomes. This takes about 5 minutes.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-0">

                {/* Section 1 — About you */}
                <SectionLabel>About you</SectionLabel>
                <div className="space-y-4 mb-0">
                  <div>
                    <FieldLabel>Name</FieldLabel>
                    <TextInput value={form.name} onChange={v => set('name', v)} placeholder="Your name" />
                  </div>
                  <div>
                    <FieldLabel optional>Email</FieldLabel>
                    <TextInput value={form.email} onChange={v => set('email', v)} placeholder="your@email.com" type="email" />
                  </div>
                </div>

                <Divider />

                {/* Section 2 — Product fit */}
                <SectionLabel>Product fit</SectionLabel>
                <div className="space-y-6">
                  <div>
                    <FieldLabel>How disappointed would you be if LYRA disappeared tomorrow?</FieldLabel>
                    <RadioGroup<DisappointmentScore>
                      value={form.disappointmentScore}
                      onChange={v => set('disappointmentScore', v)}
                      options={[
                        { value: 'VERY', label: 'Very disappointed' },
                        { value: 'SOMEWHAT', label: 'Somewhat disappointed' },
                        { value: 'NOT', label: 'Not disappointed' },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel optional>What would you use instead?</FieldLabel>
                    <TextArea
                      value={form.alternativeTool}
                      onChange={v => set('alternativeTool', v)}
                      placeholder="Another tool, manual process, or nothing..."
                      rows={2}
                    />
                  </div>
                </div>

                <Divider />

                {/* Section 3 — Feature usage */}
                <SectionLabel>Feature usage</SectionLabel>
                <div className="space-y-6">
                  <div>
                    <FieldLabel optional>Which feature did you use most?</FieldLabel>
                    <TextArea
                      value={form.mostUsedFeature}
                      onChange={v => set('mostUsedFeature', v)}
                      placeholder="e.g. AI comment responses, post scheduling..."
                      rows={2}
                    />
                  </div>
                  <div>
                    <FieldLabel optional>Which features did you never use?</FieldLabel>
                    <TextArea
                      value={form.unusedFeatures}
                      onChange={v => set('unusedFeatures', v)}
                      placeholder="e.g. Brand intelligence, analytics..."
                      rows={2}
                    />
                  </div>
                  <div>
                    <FieldLabel>Did LYRA's AI responses sound like your brand's voice?</FieldLabel>
                    <ScoreRow
                      min={1}
                      max={5}
                      value={form.aiVoiceScore}
                      onChange={v => set('aiVoiceScore', v)}
                      minLabel="Not at all"
                      maxLabel="Perfectly"
                    />
                  </div>
                </div>

                <Divider />

                {/* Section 4 — Workflow impact */}
                <SectionLabel>Workflow impact</SectionLabel>
                <div className="space-y-6">
                  <div>
                    <FieldLabel>Did AI comment management save you time?</FieldLabel>
                    <RadioGroup<TimeSavedScore>
                      value={form.timeSavedScore}
                      onChange={v => set('timeSavedScore', v)}
                      options={[
                        { value: 'SIGNIFICANT', label: 'Saved significant time' },
                        { value: 'SOME', label: 'Saved some time' },
                        { value: 'NONE', label: 'No difference' },
                        { value: 'MORE_WORK', label: 'Created more work' },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel optional>What was the most confusing part of getting started?</FieldLabel>
                    <TextArea
                      value={form.confusingPart}
                      onChange={v => set('confusingPart', v)}
                      placeholder="e.g. Connecting social accounts, understanding brand profiles..."
                      rows={2}
                    />
                  </div>
                  <div>
                    <FieldLabel optional>Was there anything you expected LYRA to do that it couldn't?</FieldLabel>
                    <TextArea
                      value={form.missingFeature}
                      onChange={v => set('missingFeature', v)}
                      placeholder="Describe what was missing..."
                      rows={2}
                    />
                  </div>
                </div>

                <Divider />

                {/* Section 5 — Pricing */}
                <SectionLabel>Pricing</SectionLabel>
                <div className="space-y-4">
                  <p className="text-xs text-text-tertiary font-sans -mt-2">Monthly subscription in AUD. Both questions are optional.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel optional>Too expensive to consider</FieldLabel>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm font-mono">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.priceTooExpensive}
                          onChange={e => set('priceTooExpensive', e.target.value)}
                          placeholder="e.g. 200"
                          className="
                            w-full pl-7 pr-4 py-3 rounded-lg
                            bg-background-secondary border border-background-border
                            text-text-primary text-sm font-mono
                            placeholder:text-text-tertiary
                            focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
                            transition-colors duration-150
                          "
                        />
                      </div>
                    </div>
                    <div>
                      <FieldLabel optional>Suspiciously cheap</FieldLabel>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm font-mono">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.priceCheap}
                          onChange={e => set('priceCheap', e.target.value)}
                          placeholder="e.g. 20"
                          className="
                            w-full pl-7 pr-4 py-3 rounded-lg
                            bg-background-secondary border border-background-border
                            text-text-primary text-sm font-mono
                            placeholder:text-text-tertiary
                            focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
                            transition-colors duration-150
                          "
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Divider />

                {/* Section 6 — Intent */}
                <SectionLabel>Intent</SectionLabel>
                <div className="space-y-6">
                  <div>
                    <FieldLabel>Would you pay for LYRA when it launches publicly?</FieldLabel>
                    <RadioGroup<WouldPay>
                      value={form.wouldPay}
                      onChange={v => set('wouldPay', v)}
                      options={[
                        { value: 'YES', label: 'Yes' },
                        { value: 'MAYBE', label: 'Maybe' },
                        { value: 'NO', label: 'No' },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel>How likely are you to recommend LYRA to a colleague?</FieldLabel>
                    <ScoreRow
                      min={0}
                      max={10}
                      value={form.npsScore}
                      onChange={v => set('npsScore', v)}
                      minLabel="Not at all likely"
                      maxLabel="Extremely likely"
                    />
                  </div>
                </div>

                <Divider />

                {/* Error */}
                {error && (
                  <p className="text-status-error text-sm font-sans mb-4">{error}</p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="
                    w-full py-3 rounded-lg font-sans font-medium text-sm
                    bg-accent-platinum text-background-primary
                    hover:bg-accent-white transition-colors duration-150
                    disabled:opacity-50 disabled:cursor-not-allowed
                    focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
                    flex items-center justify-center gap-2
                  "
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
                      Submitting
                    </>
                  ) : (
                    'Submit feedback'
                  )}
                </button>

              </form>

              <p className="text-text-tertiary text-xs font-sans mt-6 pb-16">
                Responses are stored securely and reviewed only by the LYRA team.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
