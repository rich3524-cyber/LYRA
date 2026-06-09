import { prisma } from './prisma'
import { encrypt, decrypt } from './encrypt'
import type { SocialAccount } from '@prisma/client'

// Refresh threshold — refresh tokens that expire within 5 minutes
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

/**
 * Returns a valid decrypted access token for the social account.
 * If the token is expired or near-expiry and a refresh token is available,
 * performs the platform refresh flow, re-encrypts, and persists the new token.
 * Throws if the token cannot be refreshed (platform not supported, no refresh token, etc.).
 */
export async function getValidToken(account: SocialAccount): Promise<string> {
  const isNearExpiry =
    account.tokenExpiry &&
    account.tokenExpiry.getTime() < Date.now() + EXPIRY_BUFFER_MS

  if (!isNearExpiry) {
    return decrypt(account.accessToken)
  }

  if (!account.refreshToken) {
    throw new Error(
      `Token expired for ${account.platform}:${account.id} and no refresh token stored.`
    )
  }

  const refreshed = await refreshPlatformToken(
    account.platform,
    decrypt(account.refreshToken)
  )

  // Persist the new tokens
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken:  encrypt(refreshed.accessToken),
      refreshToken: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : account.refreshToken,
      tokenExpiry:  refreshed.expiresAt,
    },
  })

  return refreshed.accessToken
}

interface RefreshedToken {
  accessToken:  string
  refreshToken?: string
  expiresAt:    Date
}

async function refreshPlatformToken(platform: string, refreshToken: string): Promise<RefreshedToken> {
  switch (platform) {
    case 'GOOGLE_BUSINESS':
    case 'YOUTUBE': {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type:    'refresh_token',
        }),
      })
      if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`)
      const data = await res.json() as { access_token: string; expires_in: number }
      return {
        accessToken: data.access_token,
        expiresAt:   new Date(Date.now() + data.expires_in * 1000),
      }
    }

    case 'LINKEDIN': {
      const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
          client_id:     process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
      })
      if (!res.ok) throw new Error(`LinkedIn token refresh failed: ${res.status}`)
      const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string }
      return {
        accessToken:  data.access_token,
        refreshToken: data.refresh_token,
        expiresAt:    new Date(Date.now() + data.expires_in * 1000),
      }
    }

    case 'FACEBOOK':
    case 'INSTAGRAM':
      // Facebook long-lived tokens are valid for 60 days and don't use a refresh flow.
      // Re-auth is required on expiry. Mark the account inactive so the workspace
      // owner is prompted to reconnect.
      throw new Error(`${platform} tokens require re-authentication when expired.`)

    case 'TWITTER': {
      const credentials = Buffer.from(
        `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
      ).toString('base64')
      const res = await fetch('https://api.twitter.com/2/oauth2/token', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
        }),
      })
      if (!res.ok) throw new Error(`Twitter token refresh failed: ${res.status}`)
      const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number }
      return {
        accessToken:  data.access_token,
        refreshToken: data.refresh_token,
        expiresAt:    new Date(Date.now() + data.expires_in * 1000),
      }
    }

    default:
      throw new Error(`Token refresh not implemented for platform: ${platform}`)
  }
}
