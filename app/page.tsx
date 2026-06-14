export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'LYRA — AI Social Media Intelligence',
  description:
    'LYRA automates social media for agencies and freelancers. Schedule posts, generate on-brand AI captions, and respond to comments autonomously — 24 hours a day.',
  alternates: { canonical: 'https://lyraonline.ai' },
  openGraph: { url: 'https://lyraonline.ai' },
}
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import EmailSubscribe from '@/components/lyra/marketing/email-subscribe'

const FOUNDING_MEMBER_LIMIT = 100

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
  { href: 'https://www.facebook.com/profile.php?id=61590029438901', Icon: FacebookIcon, label: 'LYRA on Facebook' },
  { href: 'https://www.instagram.com/lyra.online.social/', Icon: InstagramIcon, label: 'LYRA on Instagram' },
  { href: 'https://www.linkedin.com/company/lyra-online-social', Icon: LinkedInIcon, label: 'LYRA on LinkedIn' },
]

export default async function MarketingPage() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/dashboard')
  }

  const taken = await prisma.agency.count({ where: { foundingMember: true } }).catch(() => 0)
  const slotsRemaining = Math.max(0, FOUNDING_MEMBER_LIMIT - taken)

  return (
    <div className="min-h-screen bg-background-primary flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Sign in link */}
      <Link
        href="/auth/login"
        className="absolute top-6 right-6 font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors"
      >
        Sign in
      </Link>
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(170,170,170,0.04) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mb-16">
          <div className="w-9 h-9 border border-accent-silver flex items-center justify-center">
            <span className="font-sans font-light text-text-primary text-base leading-none select-none">
              L
            </span>
          </div>
          <span className="font-sans font-light text-accent-silver text-base tracking-[0.25em] select-none">
            YRA
          </span>
        </Link>

        {/* Divider */}
        <div className="w-px h-8 bg-background-border mb-12" aria-hidden="true" />

        {/* Headline */}
        <h1 className="font-display text-4xl text-text-primary mb-5 leading-tight">
          The AI that runs your social media.
        </h1>

        {/* Subtext */}
        <p className="font-sans font-light text-text-secondary text-sm leading-relaxed mb-10 max-w-xs">
          Autonomous responses. Scheduled content. Brand intelligence.
        </p>

        {/* Founding member offer */}
        <div className="w-full border border-background-border rounded-xl p-5 mb-8 text-left">
          <div className="flex items-center justify-between mb-3">
            <span className="font-sans text-[10px] font-medium text-accent-silver tracking-[0.1em] uppercase">
              Founding Member Offer
            </span>
            {slotsRemaining > 0 ? (
              <span className="font-mono text-xs text-accent-platinum">
                {slotsRemaining} of {FOUNDING_MEMBER_LIMIT} spots remaining
              </span>
            ) : (
              <span className="font-mono text-xs text-text-tertiary">
                Offer closed
              </span>
            )}
          </div>
          <p className="font-sans text-sm text-text-primary mb-1">
            Lock in current pricing forever.
          </p>
          <p className="font-sans font-light text-xs text-text-secondary">
            30-day free trial. Be among the first 100 to sign up and your price never increases — even as LYRA grows.
          </p>
        </div>

        {/* Email capture */}
        <div className="w-full mb-10">
          <EmailSubscribe />
        </div>

        {/* Social icons */}
        <div className="flex items-center gap-6 mb-6">
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

        {/* Contact */}
        <a
          href="mailto:hello@lyraonline.ai"
          className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
        >
          hello@lyraonline.ai
        </a>
      </div>
    </div>
  )
}
