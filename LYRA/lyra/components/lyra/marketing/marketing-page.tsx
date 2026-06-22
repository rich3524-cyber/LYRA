'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import MarketingNav from './marketing-nav'
import HeroSection from './hero-section'
import FeaturesSection from './features-section'
import PricingSection from './pricing-section'
import CTABanner from './cta-banner'
import MarketingFooter from './marketing-footer'

const EASE = [0.16, 1, 0.3, 1] as const

function ScrollReveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'What platforms does LYRA support?',
    a: 'LYRA supports Facebook, Instagram, LinkedIn, Google Business, X (Twitter), and TikTok. YouTube, Pinterest, Threads, and Bluesky are coming in Phase 3.',
  },
  {
    q: 'How does the AI comment response work?',
    a: 'LYRA monitors your connected accounts for new comments and reviews. For each one, it generates a draft response grounded in your brand profile. You choose the autonomy level — approve each draft, or let LYRA post automatically.',
  },
  {
    q: 'Is the free trial really free?',
    a: 'Yes. No credit card required to start. You get full access to every feature in your plan for 14 days. If you choose not to continue, your account closes with no charge.',
  },
  {
    q: 'What is Brand Intelligence?',
    a: "Brand Intelligence is LYRA's proprietary engine that analyzes your website, existing social content, and any guidelines you upload to build a deep understanding of your voice, tone, audience, and themes. Every AI output is grounded in this profile.",
  },
  {
    q: 'Can I manage multiple clients from one account?',
    a: 'Pro gives you 5 workspaces. Agency gives you unlimited. Each workspace is a self-contained client environment with its own social connections, brand profile, and settings.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your billing settings at any time. Your plan stays active until the end of the billing period.',
  },
]

const STATS = [
  { value: '6', label: 'Platforms' },
  { value: '24/7', label: 'AI monitoring' },
  { value: '< 2 min', label: 'Brand setup' },
  { value: '3', label: 'Autonomy levels' },
]

function StatsBar() {
  return (
    <ScrollReveal>
      <div className="border-y border-background-border py-8 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(({ value, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, ease: EASE, delay: i * 0.07 }}
              className="text-center"
            >
              <div className="font-mono text-2xl text-text-primary mb-1">{value}</div>
              <div className="font-sans text-xs text-text-tertiary">{label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </ScrollReveal>
  )
}

function FAQSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <section className="max-w-2xl mx-auto px-6 py-16">
      <ScrollReveal className="text-center mb-10">
        <p className="font-sans text-xs text-text-tertiary uppercase tracking-widest mb-3">FAQ</p>
        <p className="font-sans text-xl font-medium text-text-primary">Common questions.</p>
      </ScrollReveal>
      <div className="divide-y divide-background-border border-t border-background-border">
        {FAQ_ITEMS.map((item, i) => (
          <ScrollReveal key={i} delay={i * 0.04}>
            <div>
              <button
                className="w-full text-left py-4 flex items-center justify-between gap-4"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                <span className="font-sans text-sm font-medium text-text-primary">{item.q}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  className={`text-text-tertiary shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {openFaq === i && (
                  <motion.div
                    key="answer"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <p className="font-sans font-light text-sm text-text-secondary pb-4 leading-relaxed">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}

export default function MarketingPage({
  slotsRemaining,
}: {
  slotsRemaining?: number
}) {
  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
      <MarketingNav />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <HeroSection slotsRemaining={slotsRemaining} />
      </motion.div>

      <StatsBar />

      <ScrollReveal>
        <FeaturesSection />
      </ScrollReveal>

      <ScrollReveal>
        <PricingSection slotsRemaining={slotsRemaining} />
      </ScrollReveal>

      <FAQSection />

      <ScrollReveal>
        <CTABanner />
      </ScrollReveal>

      <MarketingFooter />
    </div>
  )
}
