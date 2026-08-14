import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { parseBody, ValidationError } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const crisisAwareCheckoutSchema = z.object({
  workspaceId: z.string().min(1),
  // Previously typed but not runtime-checked -- any string other than
  // 'annual' silently fell through to the monthly price ID rather than
  // being rejected, so e.g. a typo'd 'annual ' would quietly bill the wrong
  // amount. Now an unrecognised value 400s instead of guessing.
  billing: z.enum(['monthly', 'annual']).optional().default('monthly'),
})

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, billing } = await parseBody(req, crisisAwareCheckoutSchema)

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      select: { id: true, plan: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (workspace.plan !== 'PRO') {
      return NextResponse.json({ error: 'Crisis Aware add-on is available on the Pro plan only' }, { status: 403 })
    }

    // Find agency via user membership (same approach as create-checkout) so this
    // works whether or not the workspace has agencyId set directly.
    const agency = await prisma.agency.findFirst({
      where:  { members: { some: { id: user.id } } },
      select: { id: true, stripeCustomerId: true },
    })
    if (!agency) return NextResponse.json({ error: 'No agency found' }, { status: 404 })

    const priceId = billing === 'annual'
      ? process.env.STRIPE_CRISIS_AWARE_ANNUAL_PRICE_ID
      : process.env.STRIPE_CRISIS_AWARE_PRICE_ID
    if (!priceId) throw new Error('STRIPE_CRISIS_AWARE_PRICE_ID not configured')

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      customer:             agency.stripeCustomerId ?? undefined,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          `${process.env.APP_BASE_URL}/workspace/${workspaceId}/settings?crisis_activated=1`,
      cancel_url:           `${process.env.APP_BASE_URL}/workspace/${workspaceId}/settings`,
      metadata:             { agencyId: agency.id, workspaceId, type: 'crisis_aware' },
      subscription_data:    { metadata: { agencyId: agency.id, workspaceId, type: 'crisis_aware' } },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      console.error('POST /api/stripe/crisis-aware-checkout validation failed:', error.issues)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/stripe/crisis-aware-checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
