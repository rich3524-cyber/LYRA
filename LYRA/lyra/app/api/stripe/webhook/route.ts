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

      // trend_addon subscriptions carry no `plan` metadata by design -- there's
      // no entitlement model for this add-on yet (it's an unbuilt feature), so
      // explicitly skip plan management for it rather than falling through to
      // toPlan() returning undefined and relying on that alone.
      if (metadata.type === 'trend_addon') {
        console.log(`[stripe webhook] ${event.id}: trend_addon subscription ${sub.id} -- no fulfilment implemented, plan left untouched`)
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
          prisma.workspace.updateMany({
            where: { agencyId: a.id },
            data:  { plan },
          }),
        ])
      ))
      break
    }
    case 'customer.subscription.deleted': {
      const sub      = event.data.object
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
            where: { agencyId: a.id },
            data:  { plan: 'STARTER' },
          }),
        ])
      ))
      break
    }
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
        const { agencyId, plan, userId } = session.metadata
        const resolvedPlan = toPlan(plan)
        const agency = await prisma.agency.update({
          where:   { id: agencyId },
          data:    { stripeCustomerId: session.customer as string, plan: resolvedPlan },
          include: { workspaces: { take: 1 } },
        })
        // Sync plan onto existing workspaces
        await prisma.workspace.updateMany({
          where: { agencyId },
          data:  { plan: resolvedPlan },
        })
        if (agency.workspaces.length === 0 && userId) {
          const workspace = await prisma.workspace.create({
            data: { name: 'My Workspace', agencyId: agency.id, plan: resolvedPlan },
          })
          await prisma.workspaceAccess.create({
            data: { userId, workspaceId: workspace.id, role: 'AGENCY_ADMIN' },
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
    // Un-mark as processed so Stripe's retry has a chance to succeed.
    await prisma.processedWebhookEvent.delete({ where: { id: event.id } }).catch(() => {})
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
