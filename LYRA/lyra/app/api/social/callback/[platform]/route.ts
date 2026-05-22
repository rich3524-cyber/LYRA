import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import * as facebook from '@/services/social/facebook'
import * as instagram from '@/services/social/instagram'
import * as linkedin from '@/services/social/linkedin'
import * as google from '@/services/social/google-business'
import * as twitter from '@/services/social/twitter'
import * as tiktok from '@/services/social/tiktok'
import * as youtube from '@/services/social/youtube'

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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const user = await requireAuth()
    const { platform } = await params
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = parseState(searchParams.get('state'))
    const { workspaceId } = state

    if (!code || !workspaceId) {
      return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
    }

    // Verify the authenticated user actually has access to the target workspace.
    // Without this check, any logged-in user could forge the state parameter and
    // inject social tokens into another tenant's workspace.
    const workspaceAccess = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!workspaceAccess) {
      return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
    }

    switch (platform) {
      case 'facebook': {
        const shortToken = await facebook.exchangeCode(code)
        const longToken = await facebook.getLongLivedToken(shortToken)
        const pages = await facebook.getPages(longToken)
        const adAccountId = await facebook.fetchAdAccountId(longToken)

        for (const page of pages) {
          await prisma.socialAccount.upsert({
            where: { workspaceId_platform_platformId: { workspaceId, platform: 'FACEBOOK', platformId: page.id } },
            create: {
              workspaceId,
              platform: 'FACEBOOK',
              platformId: page.id,
              handle: page.name,
              name: page.name,
              avatarUrl: page.avatarUrl,
              accessToken: encrypt(page.accessToken),
              adAccountId,
            },
            update: {
              accessToken: encrypt(page.accessToken),
              adAccountId,
              isActive: true,
            },
          })

          // Also connect any linked Instagram Business Account
          try {
            const igAccount = await instagram.getConnectedAccount(page.id, page.accessToken)
            if (igAccount) {
              await prisma.socialAccount.upsert({
                where: { workspaceId_platform_platformId: { workspaceId, platform: 'INSTAGRAM', platformId: igAccount.id } },
                create: {
                  workspaceId,
                  platform: 'INSTAGRAM',
                  platformId: igAccount.id,
                  handle: igAccount.username,
                  name: igAccount.name,
                  avatarUrl: igAccount.avatarUrl,
                  accessToken: encrypt(page.accessToken), // IG uses the page token
                  adAccountId,
                },
                update: {
                  accessToken: encrypt(page.accessToken),
                  adAccountId,
                  isActive: true,
                },
              })
            }
          } catch {
            // IG account not connected to this page — skip silently
          }
        }
        break
      }

      case 'linkedin': {
        const { accessToken, expiresIn } = await linkedin.exchangeCode(code)
        const profile = await linkedin.getProfile(accessToken)
        const orgs = await linkedin.getOrganizations(accessToken, profile.id)

        if (orgs.length > 0) {
          for (const org of orgs) {
            await prisma.socialAccount.upsert({
              where: { workspaceId_platform_platformId: { workspaceId, platform: 'LINKEDIN', platformId: org.id } },
              create: {
                workspaceId,
                platform: 'LINKEDIN',
                platformId: org.id,
                handle: org.name,
                name: org.name,
                avatarUrl: org.logoUrl,
                accessToken: encrypt(accessToken),
                tokenExpiry: new Date(Date.now() + expiresIn * 1000),
              },
              update: {
                accessToken: encrypt(accessToken),
                tokenExpiry: new Date(Date.now() + expiresIn * 1000),
                isActive: true,
              },
            })
          }
        } else {
          // No org pages — store personal profile as fallback
          await prisma.socialAccount.upsert({
            where: { workspaceId_platform_platformId: { workspaceId, platform: 'LINKEDIN', platformId: profile.id } },
            create: {
              workspaceId,
              platform: 'LINKEDIN',
              platformId: profile.id,
              handle: profile.name,
              name: profile.name,
              accessToken: encrypt(accessToken),
              tokenExpiry: new Date(Date.now() + expiresIn * 1000),
            },
            update: {
              accessToken: encrypt(accessToken),
              tokenExpiry: new Date(Date.now() + expiresIn * 1000),
              isActive: true,
            },
          })
        }
        break
      }

      case 'google': {
        const { accessToken, refreshToken, expiresIn } = await google.exchangeCode(code)
        const locations = await google.getLocations(accessToken, refreshToken, expiresIn)

        for (const loc of locations) {
          await prisma.socialAccount.upsert({
            where: { workspaceId_platform_platformId: { workspaceId, platform: 'GOOGLE_BUSINESS', platformId: loc.id } },
            create: {
              workspaceId,
              platform: 'GOOGLE_BUSINESS',
              platformId: loc.id,
              handle: loc.name,
              name: loc.name,
              accessToken: encrypt(loc.accessToken),
              refreshToken: encrypt(loc.refreshToken),
              tokenExpiry: loc.tokenExpiry,
            },
            update: {
              accessToken: encrypt(loc.accessToken),
              refreshToken: encrypt(loc.refreshToken),
              tokenExpiry: loc.tokenExpiry,
              isActive: true,
            },
          })
        }
        break
      }

      case 'twitter': {
        const { codeVerifier } = state
        if (!codeVerifier) return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)

        const { accessToken, refreshToken, expiresIn } = await twitter.exchangeCode(code, codeVerifier)
        const user = await twitter.getUser(accessToken)

        await prisma.socialAccount.upsert({
          where: { workspaceId_platform_platformId: { workspaceId, platform: 'TWITTER', platformId: user.id } },
          create: {
            workspaceId,
            platform: 'TWITTER',
            platformId: user.id,
            handle: user.username,
            name: user.name,
            avatarUrl: user.avatarUrl,
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: new Date(Date.now() + expiresIn * 1000),
          },
          update: {
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: new Date(Date.now() + expiresIn * 1000),
            isActive: true,
          },
        })
        break
      }

      case 'tiktok': {
        const { accessToken, refreshToken, openId, expiresIn } = await tiktok.exchangeCode(code)
        const user = await tiktok.getUser(accessToken, openId)

        await prisma.socialAccount.upsert({
          where: { workspaceId_platform_platformId: { workspaceId, platform: 'TIKTOK', platformId: openId } },
          create: {
            workspaceId,
            platform: 'TIKTOK',
            platformId: openId,
            handle: user.name,
            name: user.name,
            avatarUrl: user.avatarUrl,
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: new Date(Date.now() + expiresIn * 1000),
          },
          update: {
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: new Date(Date.now() + expiresIn * 1000),
            isActive: true,
          },
        })
        break
      }

      case 'youtube': {
        const { accessToken, refreshToken, expiresIn } = await youtube.exchangeCode(code)
        const channel = await youtube.getChannel(accessToken, refreshToken, expiresIn)

        await prisma.socialAccount.upsert({
          where: { workspaceId_platform_platformId: { workspaceId, platform: 'YOUTUBE', platformId: channel.id } },
          create: {
            workspaceId,
            platform: 'YOUTUBE',
            platformId: channel.id,
            handle: channel.handle,
            name: channel.name,
            avatarUrl: channel.avatarUrl,
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: channel.tokenExpiry,
          },
          update: {
            accessToken: encrypt(accessToken),
            refreshToken: encrypt(refreshToken),
            tokenExpiry: channel.tokenExpiry,
            isActive: true,
          },
        })
        break
      }

      default:
        return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
    }

    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?connected=${platform}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error(`GET /api/social/callback/[platform] error:`, error)
    return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
  }
}
