import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import * as instagram from '@/services/social/instagram'
import { encrypt } from '@/lib/encrypt'

export const dynamic = 'force-dynamic'

interface PendingPage {
  id: string
  name: string
  avatarUrl: string | null
  encryptedToken: string
}

interface PendingData {
  adAccountId: string | null
  pages: PendingPage[]
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json() as { key: string; selectedPageIds: string[] }
    const { key, selectedPageIds } = body

    if (!key || !Array.isArray(selectedPageIds) || selectedPageIds.length === 0) {
      return NextResponse.json({ error: 'key and selectedPageIds required' }, { status: 400 })
    }

    const pending = await prisma.facebookPending.findUnique({ where: { key } })
    if (!pending || pending.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Pending session expired. Please reconnect Facebook.' }, { status: 404 })
    }

    // Verify the requesting user has access to the workspace in the pending data
    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: pending.workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = pending.data as unknown as PendingData
    const selectedPages = data.pages.filter((p) => selectedPageIds.includes(p.id))

    for (const page of selectedPages) {
      const rawToken = decrypt(page.encryptedToken)

      await prisma.socialAccount.upsert({
        where: {
          workspaceId_platform_platformId: {
            workspaceId: pending.workspaceId,
            platform: 'FACEBOOK',
            platformId: page.id,
          },
        },
        create: {
          workspaceId: pending.workspaceId,
          platform: 'FACEBOOK',
          platformId: page.id,
          handle: page.name,
          name: page.name,
          avatarUrl: page.avatarUrl,
          accessToken: page.encryptedToken,
          adAccountId: data.adAccountId,
        },
        update: {
          accessToken: page.encryptedToken,
          adAccountId: data.adAccountId,
          isActive: true,
        },
      })

      // Also connect any linked Instagram Business Account
      try {
        const igAccount = await instagram.getConnectedAccount(page.id, rawToken)
        if (igAccount) {
          await prisma.socialAccount.upsert({
            where: {
              workspaceId_platform_platformId: {
                workspaceId: pending.workspaceId,
                platform: 'INSTAGRAM',
                platformId: igAccount.id,
              },
            },
            create: {
              workspaceId: pending.workspaceId,
              platform: 'INSTAGRAM',
              platformId: igAccount.id,
              handle: igAccount.username,
              name: igAccount.name,
              avatarUrl: igAccount.avatarUrl,
              accessToken: encrypt(rawToken),
              adAccountId: data.adAccountId,
            },
            update: {
              accessToken: encrypt(rawToken),
              adAccountId: data.adAccountId,
              isActive: true,
            },
          })
        }
      } catch {
        // IG account not connected to this page — skip silently
      }
    }

    // Clean up — delete the pending record
    await prisma.facebookPending.delete({ where: { key } })

    return NextResponse.json({ connected: selectedPages.length })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/social/facebook/complete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
