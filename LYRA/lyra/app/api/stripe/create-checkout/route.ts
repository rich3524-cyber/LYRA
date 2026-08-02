import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, PLANS, type PlanKey } from '@/lib/stripe'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'


export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    // This action changes the whole agency's plan, not a single workspace's --
    // there's no WorkspaceAccess row to check here. canWrite(user.role) is a
    // no-op today (lib/auth.ts never sets User.role to anything but its schema
    // default SMB_OWNER -- confirmed via grep, nothing in the codebase writes
    // it), kept for when a real per-user role gets populated. The actual
    // protection today is the `Agency.members` filter below: a CLIENT_VIEW
    // user only ever gets a WorkspaceAccess row (there is no code path that
    // adds them to Agency.members), so they fail the "No agency found" check
    // before this handler does anything billing-related.
    if (!canWrite(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { plan } = await req.json() as { plan: PlanKey }

    if (!PLANS[plan]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // Find the agency this user belongs to
    const agency = await prisma.agency.findFirst({
      where: { members: { some: { id: user.id } } },
    })
    if (!agency) return NextResponse.json({ error: 'No agency found' }, { status: 404 })

    // Reuse existing Stripe customer or let Checkout create one
    const session = await stripe.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      customer:           agency.stripeCustomerId ?? undefined,
      line_items:         [{ price: PLANS[plan].priceId, quantity: 1 }],
      success_url:        `${process.env.APP_BASE_URL}/account/billing?success=1`,
      cancel_url:         `${process.env.APP_BASE_URL}/account/billing?cancelled=1`,
      metadata:           { agencyId: agency.id, plan, userId: user.id },
      subscription_data:  { metadata: { agencyId: agency.id, plan, userId: user.id } },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/stripe/create-checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Billing portal — lets customers manage their subscription
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    void req
    if (!canWrite(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const agency = await prisma.agency.findFirst({
      where: { members: { some: { id: user.id } } },
    })
    if (!agency?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account' }, { status: 404 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   agency.stripeCustomerId,
      return_url: `${process.env.APP_BASE_URL}/account/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/stripe/create-checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
