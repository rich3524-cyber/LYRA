import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json() as { workspaceId: string }

    const workspace = await prisma.workspace.findFirst({
      where:   { id: workspaceId, access: { some: { userId: user.id } } },
      include: { agency: { select: { id: true, stripeCustomerId: true } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const priceId = process.env.STRIPE_TREND_PRICE_ID
    if (!priceId) throw new Error('STRIPE_TREND_PRICE_ID not configured')

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      customer:             workspace.agency?.stripeCustomerId ?? undefined,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          `${process.env.APP_BASE_URL}/workspace/${workspaceId}/settings?trend=activated`,
      cancel_url:           `${process.env.APP_BASE_URL}/workspace/${workspaceId}/settings`,
      metadata:             { workspaceId, type: 'trend_addon' },
      subscription_data:    { metadata: { workspaceId, type: 'trend_addon' } },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/stripe/trend-checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
