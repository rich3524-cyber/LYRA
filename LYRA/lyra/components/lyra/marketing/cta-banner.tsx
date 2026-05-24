import VideoPlaceholder from '@/components/lyra/marketing/video-placeholder'

export default function CTABanner() {
  return (
    <section className="py-24 border-t border-background-border px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display text-[36px] leading-[1.2] text-text-primary mb-4">
          Ready to get your time back?
        </h2>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mb-8">
          Join agencies and freelancers who let LYRA handle the social media — while they focus on the work that matters.
        </p>
        <a
          href="#pricing"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium transition-opacity duration-150 hover:opacity-80"
        >
          Start free trial →
        </a>
      </div>
      <VideoPlaceholder />
    </section>
  )
}
