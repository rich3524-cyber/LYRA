import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { subscribeEmail } from '@/lib/klaviyo'
import type { Plan } from '@prisma/client'

// Stripe sends raw bodies — must read as text/buffer, not parsed JSON
export const dynamic = 'force-dynamic'

const VALID_PLANS: Plan[] = ['STARTER', 'PRO', 'AGENCY']

function toPlan(value: string | undefined): Plan {
  const upper = value?.toUpperCase()
  if (upper && (VALID_PLANS as string[]).includes(upper)) return upper as Plan
  return 'STARTER'
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

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object
      await prisma.agency.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data:  {
          stripeSubId: sub.id,
          plan:        toPlan((sub.metadata as Record<string, string>).plan),
        },
      })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      await prisma.agency.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data:  { plan: 'STARTER', stripeSubId: null },
      })
      break
    }
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
        const { agencyId, plan, userId } = session.metadata
        const agency = await prisma.agency.update({
          where:   { id: agencyId },
          data:    { stripeCustomerId: session.customer as string },
          include: { workspaces: { take: 1 } },
        })
        if (agency.workspaces.length === 0 && userId) {
          const workspace = await prisma.workspace.create({
            data: { name: 'My Workspace', agencyId: agency.id, plan: toPlan(plan) },
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

  return NextResponse.json({ received: true })
}
