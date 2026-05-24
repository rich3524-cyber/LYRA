import Link from 'next/link'
import EmailSubscribe from '@/components/lyra/marketing/email-subscribe'

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

const SOCIAL_LINKS = [
  {
    href:  'https://www.facebook.com/profile.php?id=61590029438901',
    Icon:  FacebookIcon,
    label: 'LYRA on Facebook',
  },
  {
    href:  'https://www.instagram.com/lyra.online.social/',
    Icon:  InstagramIcon,
    label: 'LYRA on Instagram',
  },
  {
    href:  'https://www.linkedin.com/company/lyra-online-social',
    Icon:  LinkedInIcon,
    label: 'LYRA on LinkedIn',
  },
]

export default function MarketingFooter() {
  return (
    <footer className="border-t border-background-border py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        {/* Subscribe — top */}
        <div className="max-w-sm mx-auto w-full border-b border-background-border pb-8 mb-8">
          <EmailSubscribe />
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo — left */}
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

          {/* Links — centre */}
          <nav className="flex items-center gap-6">
            <a
              href="/docs/legal/LYRA-Privacy-Policy.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
            >
              Privacy Policy
            </a>
            <a
              href="/docs/legal/LYRA-Terms-of-Service.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
            >
              Terms of Service
            </a>
            <a
              href="mailto:hello@lyraonline.ai"
              className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
            >
              Contact
            </a>
          </nav>

          {/* Social icons */}
          <div className="flex items-center gap-4">
            {SOCIAL_LINKS.map(({ href, Icon, label }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="text-text-tertiary hover:text-text-secondary transition-colors duration-150"
              >
                <Icon />
              </a>
            ))}
          </div>

          {/* Copyright — right */}
          <p className="font-sans text-xs text-text-tertiary">
            © 2026 LYRA. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
