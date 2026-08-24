import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, PLANS, type PlanKey } from '@/lib/stripe'
import { canWrite } from '@/lib/authz'
import { parseBody, ValidationError } from '@/lib/validate'

export const dynamic = 'force-dynamic'

// Only the shape (a string) is validated here -- which string values are
// actually acceptable plan keys is still decided below via Object.hasOwn,
// which also guards against prototype-chain property names (see comment on
// that check). Narrowing this schema to z.enum(Object.keys(PLANS)) would
// change the response body for those cases (ValidationError's generic
// message instead of the existing 'Invalid plan' message the tests assert),
// so the shape check and the value check are kept deliberately separate.
const createCheckoutSchema = z.object({
  plan: z.string(),
})


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
    const { plan: planInput } = await parseBody(req, createCheckoutSchema)

    // Object.hasOwn, not a plain PLANS[plan] truthiness check -- PLANS is a
    // plain object literal, so a plan value like "__proto__", "constructor",
    // or "toString" resolves through the prototype chain to a truthy value
    // and would sail past `!PLANS[plan]`. Same fix already applied to
    // app/api/upload/media-presign/route.ts's equivalent ALLOWED_MIME_TYPES
    // lookup, for the same reason.
    if (!Object.hasOwn(PLANS, planInput)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    const plan = planInput as PlanKey

    // Find the agency this user belongs to
    const agency = await prisma.agency.findFirst({
      where: { members: { some: { id: user.id } } },
    })
    if (!agency) return NextResponse.json({ error: 'No agency found' }, { status: 404 })

    // Existing subscription -- modify it in place rather than creating a
    // second concurrent one. metadata.plan must be set here too: the webhook's
    // customer.subscription.updated handler (app/api/stripe/webhook/route.ts)
    // reads sub.metadata.plan to decide what to sync to agency.plan, not the
    // price ID -- omitting it would make the webhook silently revert this.
    if (agency.stripeSubId) {
      const subscription = await stripe.subscriptions.retrieve(agency.stripeSubId)

      // A canceled or fully-expired subscription can't be revived with
      // subscriptions.update() -- Stripe rejects it. Treat this the same as
      // agency.stripeSubId being unset and fall through to Checkout below,
      // which starts a fresh subscription. Without this, an agency stuck
      // with a stale stripeSubId (missed webhook, or the account-deletion
      // cancellation path) would have its upgrade path permanently broken.
      if (subscription.status !== 'canceled' && subscription.status !== 'incomplete_expired') {
        // Single-item assumption: an agency subscription in this codebase
        // only ever carries the one plan-tier item -- add-ons are separate
        // Stripe subscriptions, not additional items here. Guard instead of
        // blindly indexing [0] so an unexpected empty `items.data` fails
        // with a diagnosable error rather than an opaque TypeError -> 500.
        const item = subscription.items.data[0]
        if (!item) throw new Error(`Subscription ${agency.stripeSubId} has no items`)

        // Preserve the subscriber's current billing interval. Switching an
        // annual subscriber to the monthly price here would combine with
        // create_prorations to generate a large unwanted credit for their
        // unused annual term -- silently converting them to monthly billing.
        const isAnnual = item.price?.recurring?.interval === 'year'
        const priceId  = isAnnual ? PLANS[plan].annualPriceId : PLANS[plan].priceId

        await stripe.subscriptions.update(agency.stripeSubId, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: 'create_prorations',
          metadata: { agencyId: agency.id, plan, userId: user.id },
        })
        return NextResponse.json({ success: true })
      }
    }

    // No existing subscription yet -- Checkout collects a payment method.
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
    if (error instanceof ValidationError) {
      console.error('POST /api/stripe/create-checkout validation failed:', error.issues)
      return NextResponse.json({ error: error.message }, { status: 400 })
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
