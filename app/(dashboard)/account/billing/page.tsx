import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PLANS } from '@/lib/stripe'
import { BillingClient } from './billing-client'

export default async function BillingPage() {
  const user = await requireAuth()

  const agency = await prisma.agency.findFirst({
    where: { members: { some: { id: user.id } } },
    select: { id: true, plan: true, stripeCustomerId: true, stripeSubId: true },
  })

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="font-display text-4xl text-text-primary">Billing</h1>
        <p className="font-sans text-sm text-text-secondary mt-1">Manage your subscription and plan.</p>
      </div>
      <BillingClient
        currentPlan={agency?.plan ?? 'STARTER'}
        hasStripeAccount={!!agency?.stripeCustomerId}
        plans={PLANS}
      />
    </div>
  )
}
