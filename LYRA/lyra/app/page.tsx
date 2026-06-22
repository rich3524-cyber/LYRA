export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import MarketingPage from '@/components/lyra/marketing/marketing-page'

export const metadata: Metadata = {
  title: 'LYRA — AI Social Media Intelligence',
  description:
    'LYRA automates social media for agencies and freelancers. Schedule posts, generate on-brand AI captions, and respond to comments autonomously — 24 hours a day.',
  alternates: { canonical: 'https://lyraonline.ai' },
  openGraph: { url: 'https://lyraonline.ai' },
}

const FOUNDING_MEMBER_LIMIT = 100

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/dashboard')
  }

  const taken = await prisma.agency.count({ where: { foundingMember: true } }).catch(() => 0)
  const slotsRemaining = Math.max(0, FOUNDING_MEMBER_LIMIT - taken)

  return <MarketingPage slotsRemaining={slotsRemaining} />
}
