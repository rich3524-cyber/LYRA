import HeroCarousel from '@/components/lyra/marketing/hero-carousel'

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 px-6">
      {/* gradient glow — inline style required */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(139, 92, 246, 0.30) 0%, rgba(59, 130, 246, 0.15) 35%, transparent 65%)',
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Eyebrow chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-background-border bg-background-secondary mb-6">
          <span className="font-sans text-xs text-text-secondary tracking-wide">
            AI-Powered Social Intelligence
          </span>
        </div>

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
          14-day free trial. Card required. Cancel any time.
        </p>
      </div>

      {/* Carousel */}
      <HeroCarousel />
    </section>
  )
}
