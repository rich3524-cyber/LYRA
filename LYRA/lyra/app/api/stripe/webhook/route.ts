import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import type { Plan } from '@prisma/client'

// Stripe sends raw bodies — must read as text/buffer, not parsed JSON
export const dynamic = 'force-dynamic'

const VALID_PLANS: Plan[] = ['STARTER', 'PRO', 'AGENCY']

function toPlan(value: string | undefined): Plan {
  if (value && (VALID_PLANS as string[]).includes(value)) return value as Plan
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
        await prisma.agency.update({
          where: { id: session.metadata.agencyId },
          data:  { stripeCustomerId: session.customer as string },
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
