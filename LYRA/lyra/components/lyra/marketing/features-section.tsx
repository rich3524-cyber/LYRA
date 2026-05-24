import { Zap, MessageSquare, Calendar } from 'lucide-react'

const FEATURES = [
  {
    icon: Zap,
    title: 'Brand Intelligence',
    body: 'LYRA scrapes your website and social history to build a precise brand voice profile. Every caption and response reflects the brand — not a template.',
  },
  {
    icon: MessageSquare,
    title: 'Autonomous AI Responses',
    body: 'Every comment and review across 7 platforms is monitored and responded to on your behalf — 24 hours a day. You set the guardrails. LYRA handles the rest.',
  },
  {
    icon: Calendar,
    title: 'Intelligent Scheduling',
    body: 'Generate platform-optimised captions with one click and schedule across Facebook, Instagram, LinkedIn, TikTok, X, YouTube, and Google Business.',
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 border-t border-background-border px-6">
      <div className="max-w-5xl mx-auto">
        {/* Section label */}
        <p className="font-sans text-xs text-text-tertiary uppercase tracking-[0.1em] text-center mb-3">
          What LYRA does
        </p>

        {/* Section heading */}
        <h2 className="font-display text-[36px] leading-[1.2] text-text-primary text-center mb-16">
          Intelligence that works while you sleep.
        </h2>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl bg-background-secondary border border-background-border p-6"
            >
              <div className="w-10 h-10 rounded-lg bg-background-tertiary border border-background-border flex items-center justify-center mb-4">
                <Icon size={20} strokeWidth={1.5} className="text-text-secondary" />
              </div>
              <h3 className="font-sans text-sm font-medium text-text-primary mb-2">
                {title}
              </h3>
              <p className="font-sans text-sm text-text-secondary leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
