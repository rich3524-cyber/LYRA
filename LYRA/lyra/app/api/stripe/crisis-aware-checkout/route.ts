import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, billing = 'monthly' } = await req.json() as { workspaceId: string; billing?: 'monthly' | 'annual' }

    const workspace = await prisma.workspace.findFirst({
      where:   { id: workspaceId, access: { some: { userId: user.id } } },
      include: { agency: { select: { id: true, stripeCustomerId: true, plan: true } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (workspace.plan !== 'PRO') {
      return NextResponse.json({ error: 'Crisis Aware add-on is available on the Pro plan only' }, { status: 403 })
    }

    const priceId = billing === 'annual'
      ? process.env.STRIPE_CRISIS_AWARE_ANNUAL_PRICE_ID
      : process.env.STRIPE_CRISIS_AWARE_PRICE_ID
    if (!priceId) throw new Error('STRIPE_CRISIS_AWARE_PRICE_ID not configured')

    const agencyId = workspace.agency?.id
    if (!agencyId) return NextResponse.json({ error: 'No agency found' }, { status: 404 })

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      customer:             workspace.agency?.stripeCustomerId ?? undefined,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          `${process.env.APP_BASE_URL}/workspace/${workspaceId}/settings?crisis_activated=1`,
      cancel_url:           `${process.env.APP_BASE_URL}/workspace/${workspaceId}/settings`,
      metadata:             { agencyId, workspaceId, type: 'crisis_aware' },
      subscription_data:    { metadata: { agencyId, workspaceId, type: 'crisis_aware' } },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/stripe/crisis-aware-checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
