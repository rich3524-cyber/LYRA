import HeroCarousel from '@/components/lyra/marketing/hero-carousel'

interface HeroSectionProps {
  slotsRemaining?: number
}

export default function HeroSection({ slotsRemaining = 0 }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 px-6">
      {/* gradient glow — silver/platinum ambient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 40% at 50% 10%, rgba(170,170,170,0.05) 0%, transparent 65%)',
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Eyebrow: founding member badge or product label */}
        {slotsRemaining > 0 ? (
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-background-border bg-background-secondary mb-6">
            <span className="font-mono text-xs text-accent-platinum">{slotsRemaining}</span>
            <span className="w-px h-3 bg-background-border-mid" aria-hidden="true" />
            <span className="font-sans text-xs text-text-tertiary">founding member spots remaining</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-background-border bg-background-secondary mb-6">
            <span className="font-sans text-xs text-text-secondary tracking-wide">
              AI-Powered Social Intelligence
            </span>
          </div>
        )}

        {/* H1 */}
        <h1 className="font-display text-[52px] leading-[1.1] text-text-primary mb-4">
          Social media that runs itself.
        </h1>

        {/* Subheadline */}
        <p className="font-sans text-[15px] text-text-secondary leading-relaxed max-w-xl mx-auto mb-8">
          Comments answered. Posts scheduled. Brand voice preserved — across every platform, 24 hours a day.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          <a
            href="#pricing"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium transition-opacity duration-150 hover:opacity-80"
          >
            Start free trial →
          </a>
          <a
            href="#features"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-background-border text-text-secondary font-sans text-sm transition-colors duration-150 hover:border-background-border-mid hover:text-text-primary"
          >
            See how it works
          </a>
        </div>

        {/* Trial note */}
        <p className="font-sans text-xs text-text-tertiary mb-0">
          14-day free trial. No credit card required.
        </p>
      </div>

      {/* Carousel */}
      <HeroCarousel />
    </section>
  )
}
