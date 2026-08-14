// services/social/oauth-connect.ts
//
// Per-platform OAuth-callback orchestration for GET /api/social/callback/[platform]
// -- exchanges the provider's auth code for tokens, resolves the account(s)
// to connect, and upserts (or, for Facebook, stages a pending Page-picker
// selection) the SocialAccount row(s). Split out of the route so each
// platform's connect flow is testable without an HTTP request; the route
// keeps the state-verification/workspace-access check and the
// success/failure redirect decisions, which are genuinely route concerns.
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import * as facebook from '@/services/social/facebook'
import * as linkedin from '@/services/social/linkedin'
import * as google from '@/services/social/google-business'
import * as twitter from '@/services/social/twitter'
import * as tiktok from '@/services/social/tiktok'
import * as youtube from '@/services/social/youtube'

export interface ConnectFacebookResult {
  pendingKey: string
}

/**
 * Facebook doesn't upsert a SocialAccount directly: the user must first pick
 * which Page(s) to connect, so this stages a pending selection (10-minute
 * TTL) and returns its key for the route to redirect the Page picker to.
 * Tokens are encrypted before storage; the complete route decrypts and
 * writes to DB.
 */
export async function connectFacebook(workspaceId: string, code: string): Promise<ConnectFacebookResult> {
  const shortToken = await facebook.exchangeCode(code)
  const longToken = await facebook.getLongLivedToken(shortToken)
  const pages = await facebook.getPages(longToken)
  const adAccountId = await facebook.fetchAdAccountId(longToken)

  const pending = await prisma.facebookPending.create({
    data: {
      workspaceId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      data: {
        adAccountId,
        pages: pages.map((p) => ({
          id: p.id,
          name: p.name,
          avatarUrl: p.avatarUrl ?? null,
          encryptedToken: encrypt(p.accessToken),
        })),
      },
    },
  })

  return { pendingKey: pending.key }
}

export interface ConnectLinkedInResult {
  connected: boolean
}

/** Upserts one SocialAccount per LinkedIn organization the member administers. */
export async function connectLinkedIn(workspaceId: string, code: string): Promise<ConnectLinkedInResult> {
  const { accessToken, expiresIn } = await linkedin.exchangeCode(code)
  const memberId = await linkedin.getMemberId(accessToken)
  const orgs = await linkedin.getOrganizations(accessToken, memberId)

  if (orgs.length === 0) {
    return { connected: false }
  }

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
        provider: 'NATIVE',
      },
      update: {
        accessToken: encrypt(accessToken),
        tokenExpiry: new Date(Date.now() + expiresIn * 1000),
        isActive: true,
      },
    })
  }

  return { connected: true }
}

/** Upserts one SocialAccount per Google Business location the account manages. */
export async function connectGoogleBusiness(workspaceId: string, code: string): Promise<void> {
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
        provider: 'NATIVE',
      },
      update: {
        accessToken: encrypt(loc.accessToken),
        refreshToken: encrypt(loc.refreshToken),
        tokenExpiry: loc.tokenExpiry,
        isActive: true,
      },
    })
  }
}

/**
 * Exchanges the code with the PKCE verifier the route already consumed from
 * the state store (consuming it is left to the route, since it's keyed off
 * the raw state parameter, not workspace/code) and upserts the account.
 */
export async function connectTwitter(workspaceId: string, code: string, codeVerifier: string): Promise<void> {
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
      provider: 'NATIVE',
    },
    update: {
      accessToken: encrypt(accessToken),
      refreshToken: encrypt(refreshToken),
      tokenExpiry: new Date(Date.now() + expiresIn * 1000),
      isActive: true,
    },
  })
}

export async function connectTikTok(workspaceId: string, code: string): Promise<void> {
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
      provider: 'NATIVE',
    },
    update: {
      accessToken: encrypt(accessToken),
      refreshToken: encrypt(refreshToken),
      tokenExpiry: new Date(Date.now() + expiresIn * 1000),
      isActive: true,
    },
  })
}

export async function connectYouTube(workspaceId: string, code: string): Promise<void> {
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
      provider: 'NATIVE',
    },
    update: {
      accessToken: encrypt(accessToken),
      refreshToken: encrypt(refreshToken),
      tokenExpiry: channel.tokenExpiry,
      isActive: true,
    },
  })
}
