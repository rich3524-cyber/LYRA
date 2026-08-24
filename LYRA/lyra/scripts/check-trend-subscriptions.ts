import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'

const prisma = new PrismaClient()
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-07-29.dahlia' })

// Identifies workspaces with a live Stripe subscription against the Trend add-on
// price (monthly or annual) even though the feature was never built and its
// checkout route now returns 503. Read-only -- does not cancel or refund anything.
// See docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md, Phase 0.
async function main() {
  const trendPriceIds = [
    process.env.STRIPE_TREND_PRICE_ID,
    process.env.STRIPE_TREND_ANNUAL_PRICE_ID,
  ].filter((id): id is string => Boolean(id))

  if (trendPriceIds.length === 0) {
    console.error('Neither STRIPE_TREND_PRICE_ID nor STRIPE_TREND_ANNUAL_PRICE_ID is set — nothing to check.')
    process.exit(1)
  }

  console.log(`Checking for active subscriptions against price IDs: ${trendPriceIds.join(', ')}\n`)

  const affected: Array<{ subscriptionId: string; customerId: string; customerEmail: string; workspaceName: string; status: string; currentPeriodEnd: string }> = []

  for (const priceId of trendPriceIds) {
    let startingAfter: string | undefined
    for (;;) {
      const page = await stripe.subscriptions.list({
        price: priceId,
        status: 'all',
        limit: 100,
        starting_after: startingAfter,
      })

      for (const sub of page.data) {
        if (sub.status !== 'active' && sub.status !== 'trialing' && sub.status !== 'past_due') continue

        const customer = await stripe.customers.retrieve(sub.customer as string)
        const customerEmail = customer.deleted ? '(deleted customer)' : (customer.email ?? '(no email on file)')
        const workspace = await prisma.workspace.findFirst({
          where: { stripeCustomerId: sub.customer as string },
          select: { name: true },
        })

        affected.push({
          subscriptionId: sub.id,
          customerId: sub.customer as string,
          customerEmail,
          workspaceName: workspace?.name ?? '(no matching LYRA workspace found)',
          status: sub.status,
          currentPeriodEnd: new Date(sub.items.data[0]?.current_period_end * 1000).toISOString(),
        })
      }

      if (!page.has_more) break
      startingAfter = page.data[page.data.length - 1]?.id
    }
  }

  if (affected.length === 0) {
    console.log('No active/trialing/past_due subscriptions found against the Trend add-on prices.')
  } else {
    console.log(`Found ${affected.length} subscription(s) needing a decision (refund vs. pause):\n`)
    for (const a of affected) {
      console.log(`  Subscription ${a.subscriptionId} — customer ${a.customerId} (${a.customerEmail}) — workspace "${a.workspaceName}" — status ${a.status} — current period ends ${a.currentPeriodEnd}`)
    }
    console.log('\nThis script does not cancel or refund anything. Decide refund vs. pause per subscription, then act via the Stripe dashboard or a follow-up script once decided.')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
