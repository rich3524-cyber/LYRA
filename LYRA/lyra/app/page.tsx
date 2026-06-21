export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import MarketingNav from '@/components/lyra/marketing/marketing-nav'
import HeroSection from '@/components/lyra/marketing/hero-section'
import FeaturesSection from '@/components/lyra/marketing/features-section'
import CTABanner from '@/components/lyra/marketing/cta-banner'
import PricingSection from '@/components/lyra/marketing/pricing-section'
import MarketingFooter from '@/components/lyra/marketing/marketing-footer'

export const metadata: Metadata = {
  title: 'LYRA — AI Social Media Intelligence',
  description:
    'LYRA automates social media for agencies and freelancers. Schedule posts, generate on-brand AI captions, and respond to comments autonomously — 24 hours a day.',
  alternates: { canonical: 'https://lyraonline.ai' },
  openGraph: { url: 'https://lyraonline.ai' },
}

const FOUNDING_MEMBER_LIMIT = 100

export default async function MarketingPage() {
  const user = await getCurrentUser()
  if (user) redirect('/dashboard')

  const taken = await prisma.agency.count({ where: { foundingMember: true } }).catch(() => 0)
  const slotsRemaining = Math.max(0, FOUNDING_MEMBER_LIMIT - taken)

  return (
    <div className="bg-background-primary">
      <MarketingNav />
      <main id="main-content">
        <HeroSection slotsRemaining={slotsRemaining} />
        <FeaturesSection />
        <CTABanner />
        <PricingSection slotsRemaining={slotsRemaining} />
      </main>
      <MarketingFooter />
    </div>
  )
}
