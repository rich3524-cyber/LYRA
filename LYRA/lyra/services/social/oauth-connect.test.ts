// services/social/oauth-connect.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    facebookPending: { create: vi.fn() },
    socialAccount: { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/encrypt', () => ({ encrypt: vi.fn((v: string) => `enc:${v}`) }))
vi.mock('@/services/social/facebook', () => ({
  exchangeCode: vi.fn(), getLongLivedToken: vi.fn(), getPages: vi.fn(), fetchAdAccountId: vi.fn(),
}))
vi.mock('@/services/social/linkedin', () => ({
  exchangeCode: vi.fn(), getMemberId: vi.fn(), getOrganizations: vi.fn(),
}))
vi.mock('@/services/social/google-business', () => ({ exchangeCode: vi.fn(), getLocations: vi.fn() }))
vi.mock('@/services/social/twitter', () => ({ exchangeCode: vi.fn(), getUser: vi.fn() }))
vi.mock('@/services/social/tiktok', () => ({ exchangeCode: vi.fn(), getUser: vi.fn() }))
vi.mock('@/services/social/youtube', () => ({ exchangeCode: vi.fn(), getChannel: vi.fn() }))

import { prisma } from '@/lib/prisma'
import * as facebook from '@/services/social/facebook'
import * as linkedin from '@/services/social/linkedin'
import * as google from '@/services/social/google-business'
import * as twitter from '@/services/social/twitter'
import * as tiktok from '@/services/social/tiktok'
import * as youtube from '@/services/social/youtube'
import {
  connectFacebook,
  connectLinkedIn,
  connectGoogleBusiness,
  connectTwitter,
  connectTikTok,
  connectYouTube,
} from './oauth-connect'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('connectFacebook', () => {
  it('exchanges the code, stages a pending Page selection with encrypted tokens, and returns its key', async () => {
    vi.mocked(facebook.exchangeCode).mockResolvedValue('short-token')
    vi.mocked(facebook.getLongLivedToken).mockResolvedValue('long-token')
    vi.mocked(facebook.getPages).mockResolvedValue([
      { id: 'page-1', name: 'My Page', avatarUrl: 'http://a.png', accessToken: 'page-token-1' },
    ] as never)
    vi.mocked(facebook.fetchAdAccountId).mockResolvedValue('act_1')
    vi.mocked(prisma.facebookPending.create).mockResolvedValue({ key: 'pending-key-1' } as never)

    const result = await connectFacebook('ws-1', 'auth-code')

    expect(facebook.exchangeCode).toHaveBeenCalledWith('auth-code')
    expect(facebook.getLongLivedToken).toHaveBeenCalledWith('short-token')
    expect(facebook.getPages).toHaveBeenCalledWith('long-token')
    expect(prisma.facebookPending.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        data: expect.objectContaining({
          adAccountId: 'act_1',
          pages: [expect.objectContaining({ id: 'page-1', name: 'My Page', encryptedToken: 'enc:page-token-1' })],
        }),
      }),
    })
    expect(result).toEqual({ pendingKey: 'pending-key-1' })
  })

  it('defaults a missing avatarUrl to null rather than leaving it undefined', async () => {
    vi.mocked(facebook.exchangeCode).mockResolvedValue('short-token')
    vi.mocked(facebook.getLongLivedToken).mockResolvedValue('long-token')
    vi.mocked(facebook.getPages).mockResolvedValue([
      { id: 'page-1', name: 'My Page', accessToken: 'page-token-1' },
    ] as never)
    vi.mocked(facebook.fetchAdAccountId).mockResolvedValue(null)
    vi.mocked(prisma.facebookPending.create).mockResolvedValue({ key: 'k' } as never)

    await connectFacebook('ws-1', 'auth-code')

    const call = vi.mocked(prisma.facebookPending.create).mock.calls[0][0] as unknown as {
      data: { data: { pages: Array<{ avatarUrl: unknown }> } }
    }
    expect(call.data.data.pages[0].avatarUrl).toBeNull()
  })
})

describe('connectLinkedIn', () => {
  it('upserts one SocialAccount per organization', async () => {
    vi.mocked(linkedin.exchangeCode).mockResolvedValue({ accessToken: 'tok', expiresIn: 3600 })
    vi.mocked(linkedin.getMemberId).mockResolvedValue('member-1')
    vi.mocked(linkedin.getOrganizations).mockResolvedValue([
      { id: 'org-1', name: 'Org One', logoUrl: 'http://logo1.png' },
      { id: 'org-2', name: 'Org Two', logoUrl: 'http://logo2.png' },
    ] as never)

    const result = await connectLinkedIn('ws-1', 'auth-code')

    expect(result).toEqual({ connected: true })
    expect(prisma.socialAccount.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.socialAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_platform_platformId: { workspaceId: 'ws-1', platform: 'LINKEDIN', platformId: 'org-1' } },
    }))
  })

  it('reports not connected when the member administers no organizations, without upserting anything', async () => {
    vi.mocked(linkedin.exchangeCode).mockResolvedValue({ accessToken: 'tok', expiresIn: 3600 })
    vi.mocked(linkedin.getMemberId).mockResolvedValue('member-1')
    vi.mocked(linkedin.getOrganizations).mockResolvedValue([])

    const result = await connectLinkedIn('ws-1', 'auth-code')

    expect(result).toEqual({ connected: false })
    expect(prisma.socialAccount.upsert).not.toHaveBeenCalled()
  })
})

describe('connectGoogleBusiness', () => {
  it('upserts one SocialAccount per location', async () => {
    vi.mocked(google.exchangeCode).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 3600 })
    vi.mocked(google.getLocations).mockResolvedValue([
      { id: 'loc-1', name: 'Store 1', accessToken: 'a1', refreshToken: 'r1', tokenExpiry: new Date('2027-01-01') },
    ] as never)

    await connectGoogleBusiness('ws-1', 'auth-code')

    expect(prisma.socialAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_platform_platformId: { workspaceId: 'ws-1', platform: 'GOOGLE_BUSINESS', platformId: 'loc-1' } },
    }))
  })
})

describe('connectTwitter', () => {
  it('exchanges the code with the given verifier and upserts the account', async () => {
    vi.mocked(twitter.exchangeCode).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 7200 })
    vi.mocked(twitter.getUser).mockResolvedValue({ id: 'u1', name: 'User One', username: 'user1' })

    await connectTwitter('ws-1', 'auth-code', 'verifier-1')

    expect(twitter.exchangeCode).toHaveBeenCalledWith('auth-code', 'verifier-1')
    expect(prisma.socialAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_platform_platformId: { workspaceId: 'ws-1', platform: 'TWITTER', platformId: 'u1' } },
    }))
  })
})

describe('connectTikTok', () => {
  it('exchanges the code and upserts the account keyed by openId', async () => {
    vi.mocked(tiktok.exchangeCode).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', openId: 'open-1', expiresIn: 3600 })
    vi.mocked(tiktok.getUser).mockResolvedValue({ name: 'TikTok User', avatarUrl: 'http://a.png' })

    await connectTikTok('ws-1', 'auth-code')

    expect(tiktok.getUser).toHaveBeenCalledWith('a', 'open-1')
    expect(prisma.socialAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_platform_platformId: { workspaceId: 'ws-1', platform: 'TIKTOK', platformId: 'open-1' } },
    }))
  })
})

describe('connectYouTube', () => {
  it('exchanges the code and upserts the account keyed by channel id', async () => {
    vi.mocked(youtube.exchangeCode).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 3600 })
    vi.mocked(youtube.getChannel).mockResolvedValue({
      id: 'chan-1', handle: '@handle', name: 'Channel', avatarUrl: 'http://a.png', tokenExpiry: new Date('2027-01-01'),
      accessToken: 'a', refreshToken: 'r',
    })

    await connectYouTube('ws-1', 'auth-code')

    expect(prisma.socialAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_platform_platformId: { workspaceId: 'ws-1', platform: 'YOUTUBE', platformId: 'chan-1' } },
    }))
  })
})
