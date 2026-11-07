import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import { verifyState } from '@/lib/oauth-state'
import { canWrite } from '@/lib/authz'
import { exchangeCode, getSites } from '@/services/seo/gsc-client'

export const dynamic = 'force-dynamic'


const BASE_URL = process.env.APP_BASE_URL!

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = verifyState<{ workspaceId: string }>(searchParams.get('state'))

    if (!code || !state?.workspaceId) {
      return NextResponse.redirect(`${BASE_URL}?error=gsc_oauth_failed`)
    }
    const { workspaceId } = state

    // Verify the authenticated user has access to the target workspace, WITH
    // write access. This callback is directly reachable by URL and GET
    // /api/seo/connect applies no role check of its own, so there is no
    // upstream gate -- identical reasoning to the Zernio connect callback and
    // the notification-channel callback, both of which already check a role
    // here. Without it a read-only CLIENT_VIEW member could point this
    // workspace's SEO data at a Search Console property they control and
    // overwrite the stored Google refresh token for everyone else.
    const workspaceAccess = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!workspaceAccess || !canWrite(workspaceAccess.role)) {
      return NextResponse.redirect(`${BASE_URL}?error=gsc_oauth_failed`)
    }

    const { accessToken, refreshToken } = await exchangeCode(code)
    const sites = await getSites(accessToken)

    if (sites.length === 0) {
      return NextResponse.redirect(
        `${BASE_URL}/workspace/${workspaceId}/seo?error=no_gsc_properties`
      )
    }

    // Prefer the property that matches the workspace website URL
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { websiteUrl: true },
    })

    const normalise = (url: string) =>
      url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()

    const matchedSite =
      workspace?.websiteUrl
        ? (sites.find((s) => normalise(s).includes(normalise(workspace.websiteUrl!))) ?? sites[0])
        : sites[0]

    await prisma.seoConnection.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        accessToken: encrypt(accessToken),
        refreshToken: encrypt(refreshToken),
        propertyUrl: matchedSite,
      },
      update: {
        accessToken: encrypt(accessToken),
        refreshToken: encrypt(refreshToken),
        propertyUrl: matchedSite,
      },
    })

    return NextResponse.redirect(
      `${BASE_URL}/workspace/${workspaceId}/seo?connected=true`
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/seo/callback error:', error instanceof Error ? error.message : error)
    const { searchParams: sp } = new URL(req.url)
    const rawState = verifyState<{ workspaceId: string }>(sp.get('state'))
    const wid = rawState?.workspaceId
    // Use a static error code — never reflect raw error messages to the browser
    const dest = wid
      ? `${BASE_URL}/workspace/${wid}/seo?error=gsc_oauth_failed`
      : `${BASE_URL}?error=gsc_oauth_failed`
    return NextResponse.redirect(dest)
  }
}
