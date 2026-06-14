import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import { exchangeCode, getSites } from '@/services/seo/gsc-client'

export const dynamic = 'force-dynamic'


const BASE_URL = process.env.APP_BASE_URL!

function parseState(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = parseState(searchParams.get('state'))
    const { workspaceId } = state

    if (!code || !workspaceId) {
      return NextResponse.redirect(`${BASE_URL}?error=gsc_oauth_failed`)
    }

    // Verify the authenticated user has access to the target workspace
    const workspaceAccess = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!workspaceAccess) {
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
    const rawState = parseState(sp.get('state'))
    const wid = rawState.workspaceId
    // Use a static error code — never reflect raw error messages to the browser
    const dest = wid
      ? `${BASE_URL}/workspace/${wid}/seo?error=gsc_oauth_failed`
      : `${BASE_URL}?error=gsc_oauth_failed`
    return NextResponse.redirect(dest)
  }
}
