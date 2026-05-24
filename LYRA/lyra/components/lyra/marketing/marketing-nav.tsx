import Link from 'next/link'

export default function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 bg-background-primary/90 backdrop-blur-sm border-b border-background-border">
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 border border-accent-silver flex items-center justify-center">
            <span className="font-sans font-light text-text-primary text-sm leading-none select-none">
              L
            </span>
          </div>
          <span className="font-sans font-light text-accent-silver text-sm tracking-[0.25em] select-none">
            YRA
          </span>
        </Link>

        {/* Centre links — hidden on mobile */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            Pricing
          </a>
        </div>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            Log in
          </Link>
          <a
            href="#pricing"
            className="px-4 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            Start free trial
          </a>
        </div>
      </nav>
    </header>
  )
}
