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
//
// Trend add-on checkout (app/api/stripe/webhook/route.ts) set
// subscription_data.metadata = { workspaceId, type: 'trend_addon' } and used the
// Agency's Stripe customer (agency.stripeCustomerId) as the subscription's
// customer. Workspace.stripeCustomerId is never written by anything in this
// codebase (only Agency.stripeCustomerId is), so looking a workspace up by
// Workspace.stripeCustomerId can never match -- the metadata.workspaceId is the
// only reliable path back to the workspace, with the Agency lookup by customer
// id used only to surface the billing-entity name.
async function main() {
  const trendPriceIds = [
    process.env.STRIPE_TREND_PRICE_ID,
    process.env.STRIPE_TREND_ANNUAL_PRICE_ID,
  ].filter((id): id is string => Boolean(id))

  if (trendPriceIds.length === 0) {
    console.error('Neither STRIPE_TREND_PRICE_ID nor STRIPE_TREND_ANNUAL_PRICE_ID is set — nothing to check.')
    process.exit(1)
  }

  // unpaid: still-recoverable delinquent billing. paused: billing can resume.
  // Both represent live billing risk for a feature that doesn't exist, same as
  // active/trialing/past_due.
  const liveStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused'])

  console.log(`Checking for live subscriptions against price IDs: ${trendPriceIds.join(', ')}\n`)

  const affected: Array<{
    subscriptionId: string
    customerId: string
    customerEmail: string
    workspaceMatch: string
    agencyMatch: string
    status: string
    currentPeriodEnd: string
    allPriceIds: string
  }> = []

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
        if (!liveStatuses.has(sub.status)) continue

        const customer = await stripe.customers.retrieve(sub.customer as string)
        const customerEmail = customer.deleted ? '(deleted customer)' : (customer.email ?? '(no email on file)')

        const workspaceId = sub.metadata?.workspaceId
        let workspaceMatch: string
        if (!workspaceId) {
          workspaceMatch = '(no workspaceId in subscription metadata -- ORPHANED, investigate manually)'
        } else {
          const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
          workspaceMatch = workspace?.name ?? `(workspaceId ${workspaceId} in metadata but no matching workspace -- ORPHANED)`
        }

        const agency = await prisma.agency.findFirst({ where: { stripeCustomerId: sub.customer as string }, select: { name: true } })
        const agencyMatch = agency?.name ?? '(no matching agency found for this Stripe customer)'

        const trendItem = sub.items.data.find(i => trendPriceIds.includes(i.price.id))
        const periodEnd = trendItem?.current_period_end

        affected.push({
          subscriptionId: sub.id,
          customerId: sub.customer as string,
          customerEmail,
          workspaceMatch,
          agencyMatch,
          status: sub.status,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : '(unknown)',
          allPriceIds: sub.items.data.map(i => i.price.id).join(', '),
        })
      }

      if (!page.has_more) break
      startingAfter = page.data[page.data.length - 1]?.id
    }
  }

  if (affected.length === 0) {
    console.log('No live (active/trialing/past_due/unpaid/paused) subscriptions found against the Trend add-on prices.')
  } else {
    console.log(`Found ${affected.length} subscription(s) needing a decision (refund vs. pause):\n`)
    for (const a of affected) {
      console.log(
        `  Subscription ${a.subscriptionId} — customer ${a.customerId} (${a.customerEmail}) — ` +
        `workspace: ${a.workspaceMatch} — agency: ${a.agencyMatch} — status ${a.status} — ` +
        `Trend period ends ${a.currentPeriodEnd} — all price IDs on this subscription: [${a.allPriceIds}]`
      )
    }
    console.log(
      '\nCheck "all price IDs" above before acting: if a subscription carries the customer\'s ' +
      'base plan price alongside the Trend price, cancelling the whole subscription would also ' +
      'kill their real plan -- only the Trend line item should be removed in that case.'
    )
    console.log('\nThis script does not cancel or refund anything. Decide refund vs. pause per subscription, then act via the Stripe dashboard or a follow-up script once decided.')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
