'use client'
import { useState } from 'react'
import { CheckCircle2, Globe, Sparkles, ArrowRight, Loader2 } from 'lucide-react'

interface WorkspaceInfo {
  id:         string
  name:       string
  websiteUrl: string | null
  industry:   string | null
}

interface Props {
  token:     string
  workspace: WorkspaceInfo
  alreadyCompleted: boolean
}

const STEPS = ['welcome', 'details', 'brand', 'done'] as const
type Step = typeof STEPS[number]

const INDUSTRIES = [
  'Retail', 'Hospitality', 'Health & Wellness', 'Real Estate', 'Professional Services',
  'Automotive', 'Education', 'Technology', 'Food & Beverage', 'Entertainment', 'Other',
]

export function OnboardingFlow({ token, workspace, alreadyCompleted }: Props) {
  const [step, setStep]             = useState<Step>(alreadyCompleted ? 'done' : 'welcome')
  const [websiteUrl, setWebsiteUrl] = useState(workspace.websiteUrl ?? '')
  const [industry, setIndustry]     = useState(workspace.industry ?? '')
  const [brandBrief, setBrandBrief] = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const stepIndex = STEPS.indexOf(step)
  const totalSteps = STEPS.length - 1 // exclude 'done'

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/onboarding?token=${token}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Save failed')
  }

  async function handleDetailsNext() {
    setSaving(true)
    setError('')
    try {
      await patch({ websiteUrl: websiteUrl || null, industry: industry || null })
      setStep('brand')
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleBrandNext() {
    setSaving(true)
    setError('')
    try {
      await patch({ brandBrief: brandBrief || null, complete: true })
      setStep('done')
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo / brand */}
        <div className="flex items-center justify-center mb-10">
          <span className="text-2xl font-bold tracking-tight text-[#e2e2e2]" style={{ fontFamily: 'var(--font-instrument-serif)' }}>
            lyra
          </span>
        </div>

        {/* Progress bar (hidden on welcome/done) */}
        {step !== 'welcome' && step !== 'done' && (
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs text-[#555] mb-2">
              <span>Step {stepIndex} of {totalSteps}</span>
              <span>{Math.round((stepIndex / totalSteps) * 100)}%</span>
            </div>
            <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#e2e2e2] rounded-full transition-all duration-500"
                style={{ width: `${(stepIndex / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#222] bg-[#0f0f0f] p-8">
          {/* ── WELCOME ── */}
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              <div className="h-14 w-14 rounded-2xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center mx-auto">
                <Sparkles size={24} className="text-[#e2e2e2]" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-[#e2e2e2]">
                  Welcome to LYRA
                </h1>
                <p className="text-[#555] text-sm mt-2 leading-relaxed">
                  Your agency has set up a workspace for <strong className="text-[#888]">{workspace.name}</strong>.
                  Let&apos;s take 2 minutes to personalise it.
                </p>
              </div>
              <button
                onClick={() => setStep('details')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#e2e2e2] text-[#080808] text-sm font-medium hover:bg-white transition-colors"
              >
                Get started <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ── DETAILS ── */}
          {step === 'details' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-[#e2e2e2]">Your business details</h2>
                <p className="text-sm text-[#555] mt-1">This helps us tailor your AI content.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#888] font-medium uppercase tracking-wide">Website URL</label>
                  <div className="flex items-center gap-2 rounded-xl border border-[#333] bg-[#1a1a1a] px-3 py-2.5 focus-within:border-[#555] transition-colors">
                    <Globe size={14} className="text-[#555] shrink-0" />
                    <input
                      type="url"
                      value={websiteUrl}
                      onChange={e => setWebsiteUrl(e.target.value)}
                      placeholder="https://yourbusiness.com"
                      className="flex-1 bg-transparent text-sm text-[#e2e2e2] placeholder:text-[#444] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-[#888] font-medium uppercase tracking-wide">Industry</label>
                  <select
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    className="w-full rounded-xl border border-[#333] bg-[#1a1a1a] px-3 py-2.5 text-sm text-[#e2e2e2] focus:outline-none focus:border-[#555] transition-colors appearance-none"
                  >
                    <option value="">Select your industry</option>
                    {INDUSTRIES.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('welcome')}
                  className="px-4 py-2.5 rounded-xl border border-[#333] text-sm text-[#888] hover:text-[#e2e2e2] hover:border-[#555] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleDetailsNext}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#e2e2e2] text-[#080808] text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <>Continue <ArrowRight size={14} /></>}
                </button>
              </div>
            </div>
          )}

          {/* ── BRAND ── */}
          {step === 'brand' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-[#e2e2e2]">Describe your brand voice</h2>
                <p className="text-sm text-[#555] mt-1">
                  In a few sentences, describe how you speak to customers — tone, style, what to avoid.
                </p>
              </div>

              <textarea
                value={brandBrief}
                onChange={e => setBrandBrief(e.target.value)}
                rows={5}
                placeholder="e.g. We're friendly and approachable but professional. We avoid jargon. We celebrate our community. Never use slang or be pushy."
                className="w-full rounded-xl border border-[#333] bg-[#1a1a1a] px-4 py-3 text-sm text-[#e2e2e2] placeholder:text-[#444] resize-none focus:outline-none focus:border-[#555] transition-colors"
              />

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('details')}
                  className="px-4 py-2.5 rounded-xl border border-[#333] text-sm text-[#888] hover:text-[#e2e2e2] hover:border-[#555] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleBrandNext}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#e2e2e2] text-[#080808] text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <>Complete setup <ArrowRight size={14} /></>}
                </button>
              </div>

              <p className="text-xs text-[#444] text-center">
                You can skip this — your agency can always update it later.
              </p>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="text-center space-y-6">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[#e2e2e2]">You&apos;re all set!</h2>
                <p className="text-sm text-[#555] mt-2 leading-relaxed">
                  Your workspace is ready. Your agency will take it from here — expect great content coming soon.
                </p>
              </div>
              <div className="rounded-xl border border-[#222] bg-[#1a1a1a] p-4 text-left space-y-2">
                <p className="text-xs text-[#555] font-medium uppercase tracking-wide">What happens next</p>
                <ul className="space-y-1.5 text-sm text-[#888]">
                  <li className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Brand profile built from your website</li>
                  <li className="flex items-center gap-2"><span className="text-emerald-400">✓</span> AI content scheduled for your platforms</li>
                  <li className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Comments monitored and responded to</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[#333] mt-6">
          Powered by LYRA · lyraonline.ai
        </p>
      </div>
    </div>
  )
}
