import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { subscribeEmail } from '@/lib/klaviyo'
import type { Plan } from '@prisma/client'

// Stripe sends raw bodies — must read as text/buffer, not parsed JSON
export const dynamic = 'force-dynamic'

const VALID_PLANS: Plan[] = ['STARTER', 'PRO', 'AGENCY']

// Returns undefined (not a default) when metadata carries no recognizable plan --
// callers must treat "no plan in metadata" as "don't touch the plan field" rather
// than silently defaulting to STARTER. Previously defaulted to STARTER, which
// meant the trend_addon subscription (whose metadata has no `plan` key at all)
// downgraded the paying customer's entire agency and all its workspaces to
// Starter on purchase -- a live billing-integrity bug, fixed 18 Jul 2026.
function toPlan(value: string | undefined): Plan | undefined {
  const upper = value?.toUpperCase()
  if (upper && (VALID_PLANS as string[]).includes(upper)) return upper as Plan
  return undefined
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency: Stripe redelivers events at-least-once. Several handlers below
  // (founding-member slot assignment in particular) are not naturally idempotent,
  // so a redelivered event must be recognized and skipped rather than reprocessed.
  try {
    await prisma.processedWebhookEvent.create({ data: { id: event.id } })
  } catch {
    // Unique constraint violation -- already processed this exact event.
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const metadata = sub.metadata as Record<string, string>

      // Add-on subscriptions carry a `type` in metadata -- skip plan management
      // for them entirely; each add-on has its own fulfilment path below.
      if (metadata.type === 'trend_addon') {
        await prisma.workspace.update({
          where: { id: metadata.workspaceId },
          data:  { trendSubId: sub.id },
        })
        break
      }
      if (metadata.type === 'crisis_aware') {
        // Subscription updated (e.g. renewal) -- ensure crisisAwareSubId stays set
        await prisma.agency.updateMany({
          where: { id: metadata.agencyId },
          data:  { crisisAwareSubId: sub.id },
        })
        break
      }

      const plan = toPlan(metadata.plan)
      if (!plan) {
        console.error(`[stripe webhook] ${event.id}: subscription ${sub.id} has no recognizable plan in metadata, skipping plan update`)
        break
      }
      const agencies = await prisma.agency.findMany({
        where:  { stripeCustomerId: sub.customer as string },
        select: { id: true },
      })
      await Promise.all(agencies.map(a =>
        prisma.$transaction([
          prisma.agency.update({
            where: { id: a.id },
            data:  { stripeSubId: sub.id, plan },
          }),
          // Workspaces belong to an agency through their owning user's
          // User.agencyId (via WorkspaceAccess), not Workspace.agencyId --
          // that FK is never populated by the normal onboarding flow. See the
          // 29 Jul 2026 fix note on the checkout.session.completed handler
          // below for the full incident this replaced.
          prisma.workspace.updateMany({
            where: { access: { some: { user: { agencyId: a.id } } } },
            data:  { plan },
          }),
        ])
      ))
      break
    }
    case 'customer.subscription.deleted': {
      const sub      = event.data.object
      const metadata = sub.metadata as Record<string, string>

      if (metadata.type === 'trend_addon') {
        await prisma.workspace.updateMany({
          where: { trendSubId: sub.id },
          data:  { trendSubId: null },
        })
        break
      }
      if (metadata.type === 'crisis_aware') {
        // Add-on cancelled -- clear the subscription reference from the agency
        await prisma.agency.updateMany({
          where: { crisisAwareSubId: sub.id },
          data:  { crisisAwareSubId: null },
        })
        break
      }

      // Main plan subscription deleted → downgrade to Starter
      const agencies = await prisma.agency.findMany({
        where:  { stripeCustomerId: sub.customer as string },
        select: { id: true },
      })
      await Promise.all(agencies.map(a =>
        prisma.$transaction([
          prisma.agency.update({
            where: { id: a.id },
            data:  { plan: 'STARTER', stripeSubId: null },
          }),
          prisma.workspace.updateMany({
            where: { access: { some: { user: { agencyId: a.id } } } },
            data:  { plan: 'STARTER' },
          }),
        ])
      ))
      break
    }
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.metadata?.type === 'trend_addon' && session.metadata?.workspaceId) {
        await prisma.workspace.update({
          where: { id: session.metadata.workspaceId },
          data:  { trendSubId: session.subscription as string },
        })
        break
      }
      if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
        const { agencyId, plan, userId, type } = session.metadata

        // Crisis Aware add-on purchase — record the subscription, then break
        if (type === 'crisis_aware') {
          await prisma.agency.update({
            where: { id: agencyId },
            data:  { crisisAwareSubId: session.subscription as string },
          })
          break
        }
        const resolvedPlan = toPlan(plan)
        const agency = await prisma.agency.update({
          where: { id: agencyId },
          data:  { stripeCustomerId: session.customer as string, plan: resolvedPlan },
        })
        // Sync plan onto existing workspaces. Workspaces belong to an agency
        // through their owning user's User.agencyId (via WorkspaceAccess), not
        // Workspace.agencyId -- that FK is never populated by the normal
        // onboarding flow, so filtering on it here always matched zero rows.
        // Confirmed live 29 Jul 2026: a real completed checkout updated
        // Agency.plan correctly but left every existing workspace's plan
        // untouched, AND (see below) caused the zero-workspaces check to
        // wrongly fire on an agency that already had workspaces, silently
        // creating a duplicate "My Workspace" on every subsequent checkout.
        await prisma.workspace.updateMany({
          where: { access: { some: { user: { agencyId } } } },
          data:  { plan: resolvedPlan },
        })
        const existingWorkspace = await prisma.workspace.findFirst({
          where:  { access: { some: { user: { agencyId } } } },
          select: { id: true },
        })
        if (!existingWorkspace && userId) {
          await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
              data: { name: 'My Workspace', agencyId: agency.id, plan: resolvedPlan },
            })
            await tx.workspaceAccess.create({
              data: { userId, workspaceId: workspace.id, role: 'AGENCY_ADMIN' },
            })
          })
        }
        // Subscribe the user's email to Klaviyo
        if (userId) {
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          })
          if (dbUser?.email) {
            await subscribeEmail(dbUser.email).catch((err) =>
              console.error('[webhook] klaviyo subscribe failed:', err)
            )
          }
        }

        // Assign founding member status if slots remain (first 100 sign-ups)
        if (!agency.foundingMember) {
          await prisma.$transaction(async (tx) => {
            const taken = await tx.agency.count({ where: { foundingMember: true } })
            if (taken < 100) {
              await tx.agency.update({
                where: { id: agencyId },
                data:  { foundingMember: true },
              })
            }
          })
        }
      }
      break
    }
    }
  } catch (error) {
    console.error(`[stripe webhook] ${event.id} (${event.type}) failed:`, error)
    // Un-mark as processed so Stripe's retry has a chance to succeed. If this
    // delete itself fails (e.g. the same transient DB blip that caused the
    // handler to throw in the first place), the event stays marked-processed
    // and Stripe's retry gets silently discarded by the idempotency check
    // above -- permanently losing this billing event. That failure must be
    // surfaced, not swallowed.
    await prisma.processedWebhookEvent.delete({ where: { id: event.id } }).catch((deleteError) => {
      console.error(
        `[stripe/webhook] CRITICAL: failed to un-mark event as processed after handler error — this event will be permanently lost on Stripe retry`,
        deleteError
      )
    })
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
