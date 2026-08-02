import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import { validateKlaviyoKey } from '@/services/email-marketing/klaviyo-campaigns'
import { validateMailchimpKey, extractMailchimpServer } from '@/services/email-marketing/mailchimp-campaigns'
import { validateCustomerioKey } from '@/services/email-marketing/customerio-campaigns'
import { syncEmailIntegration } from '@/services/email-marketing/sync'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const workspaceId = req.nextUrl.searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const access = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const integrations = await prisma.emailIntegration.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, provider: true, accountName: true, lastSyncAt: true, createdAt: true },
    })

    return NextResponse.json(integrations)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/email-integrations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json() as { workspaceId?: string; provider?: string; apiKey?: string }
    const { workspaceId, provider, apiKey } = body

    if (!workspaceId || !provider || !apiKey?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const access = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      select: { id: true },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let accountName: string
    let serverPrefix: string | undefined

    try {
      switch (provider) {
        case 'KLAVIYO':
          accountName = await validateKlaviyoKey(apiKey)
          break
        case 'MAILCHIMP':
          accountName = await validateMailchimpKey(apiKey)
          serverPrefix = extractMailchimpServer(apiKey)
          break
        case 'CUSTOMER_IO':
          accountName = await validateCustomerioKey(apiKey)
          break
        default:
          return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not validate API key' },
        { status: 422 }
      )
    }

    const integration = await prisma.emailIntegration.upsert({
      where: { workspaceId_provider: { workspaceId, provider: provider as 'KLAVIYO' | 'MAILCHIMP' | 'CUSTOMER_IO' } },
      update: { apiKey: encrypt(apiKey), serverPrefix: serverPrefix ?? null, accountName, isActive: true },
      create: {
        workspaceId,
        provider: provider as 'KLAVIYO' | 'MAILCHIMP' | 'CUSTOMER_IO',
        apiKey: encrypt(apiKey),
        serverPrefix: serverPrefix ?? null,
        accountName,
      },
    })

    // Initial sync — fire and forget so connect response is immediate
    syncEmailIntegration(integration.id).catch((err) =>
      console.error('[email-integration] initial sync failed:', err)
    )

    return NextResponse.json({ id: integration.id, accountName })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/email-integrations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
