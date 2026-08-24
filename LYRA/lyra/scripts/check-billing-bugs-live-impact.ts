import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'

const prisma = new PrismaClient()
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-07-29.dahlia' })

// Read-only triage for two suspected billing bugs found during the Help-docs audit
// (24 Aug 2026): (1) account deletion never cancels the deleted user's Agency's
// Stripe subscription, and (2) plan upgrades create a second concurrent Stripe
// subscription instead of modifying the existing one. Does not cancel or modify
// anything -- see docs/investigations/2026-08-24-help-docs-audit-findings.md.

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused'])

async function main() {
  // --- Check 1: orphaned Agencies (zero members) with a still-live subscription ---
  const orphanedAgencies = await prisma.agency.findMany({
    where: { members: { none: {} }, stripeSubId: { not: null } },
    select: { id: true, name: true, stripeCustomerId: true, stripeSubId: true, updatedAt: true },
  })

  console.log(`\n=== Check 1: orphaned Agencies (0 members) with a stored subscription ID ===`)
  console.log(`Found ${orphanedAgencies.length} candidate(s) in the database.\n`)

  const stillBillingOrphans: typeof orphanedAgencies = []
  for (const agency of orphanedAgencies) {
    if (!agency.stripeSubId) continue
    try {
      const sub = await stripe.subscriptions.retrieve(agency.stripeSubId)
      const status = sub.status
      console.log(`  Agency ${agency.id} ("${agency.name}") -- subscription ${agency.stripeSubId} -- Stripe status: ${status}`)
      if (LIVE_STATUSES.has(status)) stillBillingOrphans.push(agency)
    } catch (e) {
      console.log(`  Agency ${agency.id} ("${agency.name}") -- subscription ${agency.stripeSubId} -- could not retrieve from Stripe: ${e instanceof Error ? e.message : e}`)
    }
  }

  if (stillBillingOrphans.length > 0) {
    console.log(`\n  >>> ${stillBillingOrphans.length} orphaned Agenc${stillBillingOrphans.length === 1 ? 'y is' : 'ies are'} STILL ACTIVELY BILLING with no LYRA user left to manage them. <<<`)
  } else {
    console.log(`\n  No orphaned Agency has a currently-live subscription.`)
  }

  // --- Check 2: any Agency's Stripe customer with 2+ concurrent live subscriptions ---
  const allAgenciesWithCustomer = await prisma.agency.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { id: true, name: true, stripeCustomerId: true },
  })

  console.log(`\n=== Check 2: Agencies whose Stripe customer has 2+ concurrent live subscriptions ===`)
  console.log(`Checking ${allAgenciesWithCustomer.length} Agenc${allAgenciesWithCustomer.length === 1 ? 'y' : 'ies'} with a Stripe customer ID.\n`)

  const duplicateSubAgencies: Array<{ id: string; name: string; customerId: string; subs: Array<{ id: string; status: string; priceId: string | undefined }> }> = []

  for (const agency of allAgenciesWithCustomer) {
    if (!agency.stripeCustomerId) continue
    const subs = await stripe.subscriptions.list({ customer: agency.stripeCustomerId, status: 'all', limit: 100 })
    const live = subs.data.filter((s) => LIVE_STATUSES.has(s.status))
    if (live.length >= 2) {
      const summarized = live.map((s) => ({ id: s.id, status: s.status, priceId: s.items.data[0]?.price?.id }))
      duplicateSubAgencies.push({ id: agency.id, name: agency.name, customerId: agency.stripeCustomerId, subs: summarized })
      console.log(`  Agency ${agency.id} ("${agency.name}") -- customer ${agency.stripeCustomerId} -- ${live.length} concurrent live subscriptions:`)
      for (const s of summarized) console.log(`      ${s.id} -- status ${s.status} -- price ${s.priceId ?? '(unknown)'}`)
    }
  }

  if (duplicateSubAgencies.length > 0) {
    console.log(`\n  >>> ${duplicateSubAgencies.length} Agenc${duplicateSubAgencies.length === 1 ? 'y has' : 'ies have'} 2+ concurrent live subscriptions -- likely being double-charged. <<<`)
  } else {
    console.log(`\n  No Agency currently has more than one concurrent live subscription.`)
  }

  console.log(`\nThis script does not cancel, modify, or refund anything. Results above are for triage only.`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
