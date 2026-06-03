import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import { syncEmailCampaigns } from '@/services/email/sync'
import type { EmailProvider } from '@prisma/client'

const VALID_PROVIDERS: EmailProvider[] = ['KLAVIYO', 'MAILCHIMP']

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, provider, apiKey, serverPrefix } = await req.json()

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 })
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 })
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json({ error: 'API key is required.' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Build credentials JSON by provider
    let credentialsObj: Record<string, string>
    if (provider === 'MAILCHIMP') {
      // Parse server prefix from key suffix (e.g. "abc123-us6" → "us6")
      const rawPrefix = serverPrefix?.trim() || apiKey.trim().split('-').pop() || ''
      // Mailchimp prefixes are always 2 lowercase letters + 1-3 digits (e.g. us6, us21)
      if (!/^[a-z]{2}\d{1,3}$/.test(rawPrefix)) {
        return NextResponse.json({
          error: 'Invalid Mailchimp server prefix. Check your API key ends with a region code such as -us6.',
        }, { status: 400 })
      }
      credentialsObj = { apiKey: apiKey.trim(), serverPrefix: rawPrefix }
    } else {
      credentialsObj = { apiKey: apiKey.trim() }
    }

    const credentials = encrypt(JSON.stringify(credentialsObj))

    const connection = await prisma.emailConnection.upsert({
      where:  { workspaceId },
      create: { workspaceId, provider, credentials, isActive: true },
      update: { provider, credentials, isActive: true, lastSyncError: null },
    })

    // Fire initial sync non-blocking — client gets a response immediately
    syncEmailCampaigns(workspaceId).catch(err =>
      console.error('[email/connect] initial sync failed:', err)
    )

    return NextResponse.json({
      success: true,
      connection: {
        id:           connection.id,
        provider:     connection.provider,
        isActive:     connection.isActive,
        lastSyncAt:   connection.lastSyncAt,
        lastSyncError: connection.lastSyncError,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[email/connect] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // deleteMany is safe when no row exists — cascades EmailCampaign records
    await prisma.emailConnection.deleteMany({ where: { workspaceId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[email/connect DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
