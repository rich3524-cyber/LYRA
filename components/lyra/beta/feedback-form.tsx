'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Loader2 } from 'lucide-react'

type FeedbackType = 'BUG_REPORT' | 'FEATURE_REQUEST' | 'GENERAL' | 'PRAISE'

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  BUG_REPORT:      'Bug report',
  FEATURE_REQUEST: 'Feature request',
  GENERAL:         'General feedback',
  PRAISE:          'Praise',
}

const EASING = [0.16, 1, 0.3, 1] as const

export function FeedbackForm() {
  const [name, setName] = useState('')
  const [feedbackType, setFeedbackType] = useState<FeedbackType | ''>('')
  const [description, setDescription] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Name is required.'); return }
    if (!feedbackType) { setError('Please select a feedback type.'); return }
    if (!description.trim()) { setError('Description is required.'); return }
    if (rating === null) { setError('Please provide a rating.'); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), feedbackType, description: description.trim(), rating }),
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
      <div className="max-w-xl mx-auto">

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
                Thank you, {name.split(' ')[0]}.
              </h1>
              <p className="text-text-secondary text-sm font-sans leading-relaxed">
                Your feedback has been recorded. We read every submission.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: EASING }}
            >
              <div className="mb-10">
                <h1 className="font-display text-[40px] leading-[1.2] text-text-primary mb-3">
                  Share Feedback
                </h1>
                <p className="text-text-secondary text-sm font-sans leading-relaxed">
                  Use this form any time during the beta. Bugs, ideas, and honest reactions are all welcome.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Name */}
                <div>
                  <label className="block text-sm font-sans font-medium text-text-primary mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    className="
                      w-full px-4 py-3 rounded-lg
                      bg-background-secondary border border-background-border
                      text-text-primary text-sm font-sans placeholder:text-text-tertiary
                      focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
                      transition-colors duration-150
                    "
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-sans font-medium text-text-primary mb-2">Type of feedback</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(FEEDBACK_LABELS) as FeedbackType[]).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFeedbackType(type)}
                        className={`
                          px-4 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-150
                          border focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
                          ${
                            feedbackType === type
                              ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                              : 'bg-background-secondary text-text-secondary border-background-border hover:border-background-border-mid hover:text-text-primary'
                          }
                        `}
                      >
                        {FEEDBACK_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-sans font-medium text-text-primary mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe what you experienced or what you'd like to see..."
                    rows={5}
                    className="
                      w-full px-4 py-3 rounded-lg resize-none
                      bg-background-secondary border border-background-border
                      text-text-primary text-sm font-sans placeholder:text-text-tertiary
                      focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
                      transition-colors duration-150
                    "
                  />
                </div>

                {/* Rating */}
                <div>
                  <label className="block text-sm font-sans font-medium text-text-primary mb-2">Overall rating so far</label>
                  <div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          className={`
                            w-10 h-10 rounded-lg text-sm font-mono transition-all duration-150
                            border focus:outline-none focus:ring-2 focus:ring-accent-silver focus:ring-offset-2 focus:ring-offset-background-primary
                            ${
                              rating === n
                                ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                                : 'bg-background-secondary text-text-secondary border-background-border hover:border-background-border-mid hover:text-text-primary'
                            }
                          `}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-xs text-text-tertiary font-sans">Poor</span>
                      <span className="text-xs text-text-tertiary font-sans">Excellent</span>
                    </div>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="text-status-error text-sm font-sans">{error}</p>
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
                    'Submit'
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
