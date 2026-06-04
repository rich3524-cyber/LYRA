export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import MarketingNav from '@/components/lyra/marketing/marketing-nav'
import HeroSection from '@/components/lyra/marketing/hero-section'
import FeaturesSection from '@/components/lyra/marketing/features-section'
import PricingSection from '@/components/lyra/marketing/pricing-section'
import CTABanner from '@/components/lyra/marketing/cta-banner'
import MarketingFooter from '@/components/lyra/marketing/marketing-footer'

export const metadata: Metadata = {
  title: 'LYRA — AI Social Media Intelligence',
  description:
    'LYRA automates social media for agencies and freelancers. Schedule posts, generate on-brand AI captions, and respond to comments autonomously — 24 hours a day.',
  alternates: { canonical: 'https://lyraonline.ai' },
  openGraph: { url: 'https://lyraonline.ai' },
}

export default async function MarketingPage() {
  const user = await getCurrentUser()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background-primary">
      <MarketingNav />
      <main>
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
        <CTABanner />
      </main>
      <MarketingFooter />
    </div>
  )
}
