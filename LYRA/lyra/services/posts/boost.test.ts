// services/posts/boost.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    postBoost: { deleteMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/encrypt', () => ({ decrypt: vi.fn((v: string) => `plain:${v}`) }))
vi.mock('@/services/social/meta-ads', () => ({ createBoost: vi.fn(), cancelBoost: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { createBoost, cancelBoost } from '@/services/social/meta-ads'
import {
  validateBoostRequest,
  checkBoostEligibility,
  createPostBoost,
  checkCancelEligibility,
  cancelPostBoost,
} from './boost'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateBoostRequest', () => {
  it('accepts a fully valid request', () => {
    const result = validateBoostRequest({ budget: 2500, durationDays: 7, audience: 'followers' })
    expect(result).toEqual({ valid: true, budget: 2500, durationDays: 7, audience: 'followers' })
  })

  it('rejects a missing field before checking any allow-list', () => {
    const result = validateBoostRequest({ budget: 2500, durationDays: 7 })
    expect(result).toEqual({ valid: false, error: 'budget, durationDays, and audience required' })
  })

  it('rejects an unlisted budget', () => {
    const result = validateBoostRequest({ budget: 999, durationDays: 7, audience: 'followers' })
    expect(result).toEqual({ valid: false, error: 'Invalid budget. Choose $10, $25, $50, or $100.' })
  })

  it('rejects an unlisted duration', () => {
    const result = validateBoostRequest({ budget: 2500, durationDays: 5, audience: 'followers' })
    expect(result).toEqual({ valid: false, error: 'Invalid duration. Choose 3, 7, 14, or 30 days.' })
  })

  it('rejects an unlisted audience', () => {
    const result = validateBoostRequest({ budget: 2500, durationDays: 7, audience: 'everyone' })
    expect(result).toEqual({ valid: false, error: 'Invalid audience option.' })
  })

  it('accepts every documented budget/duration/audience combination', () => {
    for (const budget of [1000, 2500, 5000, 10000]) {
      for (const durationDays of [3, 7, 14, 30]) {
        for (const audience of ['followers', 'followers_lookalike', 'broad'] as const) {
          expect(validateBoostRequest({ budget, durationDays, audience })).toEqual({
            valid: true, budget, durationDays, audience,
          })
        }
      }
    }
  })
})

function eligiblePost(overrides: Record<string, unknown> = {}) {
  return {
    status: 'PUBLISHED',
    platformPostId: 'plat-1',
    workspace: { plan: 'PRO' },
    socialAccount: { platform: 'FACEBOOK', adAccountId: 'act_1', accessToken: 'enc-token' },
    ...overrides,
  }
}

describe('checkBoostEligibility', () => {
  it('allows an eligible published Facebook post on a Pro plan', () => {
    expect(checkBoostEligibility(eligiblePost())).toEqual({ eligible: true })
  })

  it('rejects a STARTER-plan workspace before any other check', () => {
    const result = checkBoostEligibility(eligiblePost({ workspace: { plan: 'STARTER' } }))
    expect(result).toEqual({ eligible: false, status: 403, error: 'Boosting requires Pro or Agency plan' })
  })

  it('rejects a post that is not PUBLISHED', () => {
    const result = checkBoostEligibility(eligiblePost({ status: 'DRAFT' }))
    expect(result).toEqual({ eligible: false, status: 400, error: 'Post must be published to boost' })
  })

  it('rejects a published post with no platformPostId', () => {
    const result = checkBoostEligibility(eligiblePost({ platformPostId: null }))
    expect(result).toEqual({ eligible: false, status: 400, error: 'Post must be published to boost' })
  })

  it('rejects a platform other than Facebook/Instagram', () => {
    const result = checkBoostEligibility(
      eligiblePost({ socialAccount: { platform: 'LINKEDIN', adAccountId: 'act_1', accessToken: 'enc-token' } })
    )
    expect(result).toEqual({
      eligible: false, status: 400, error: 'Boosting is only available for Facebook and Instagram posts',
    })
  })

  it('allows Instagram same as Facebook', () => {
    const result = checkBoostEligibility(
      eligiblePost({ socialAccount: { platform: 'INSTAGRAM', adAccountId: 'act_1', accessToken: 'enc-token' } })
    )
    expect(result).toEqual({ eligible: true })
  })

  it('rejects a missing ad account', () => {
    const result = checkBoostEligibility(
      eligiblePost({ socialAccount: { platform: 'FACEBOOK', adAccountId: null, accessToken: 'enc-token' } })
    )
    expect(result).toEqual({
      eligible: false, status: 400,
      error: 'No Facebook Ad Account connected. Connect one in Facebook Business Manager.',
    })
  })

  it('rejects a missing access token', () => {
    const result = checkBoostEligibility(
      eligiblePost({ socialAccount: { platform: 'FACEBOOK', adAccountId: 'act_1', accessToken: null } })
    )
    expect(result).toEqual({ eligible: false, status: 400, error: 'This account has no access token.' })
  })
})

describe('createPostBoost', () => {
  it('decrypts the token, calls Meta, clears stale boosts, and creates the new one', async () => {
    vi.mocked(createBoost).mockResolvedValue({ adCampaignId: 'c1', adSetId: 's1', adId: 'a1' })
    vi.mocked(prisma.postBoost.create).mockImplementation(
      (async ({ data }: { data: unknown }) => ({ id: 'boost-1', ...(data as object) })) as never
    )

    const result = await createPostBoost({
      postId: 'post-1',
      platform: 'FACEBOOK',
      platformPostId: 'plat-1',
      pageId: 'page-1',
      adAccountId: 'act_1',
      encryptedAccessToken: 'enc-token',
      budget: 2500,
      durationDays: 7,
      audience: 'followers',
    })

    expect(decrypt).toHaveBeenCalledWith('enc-token')
    expect(createBoost).toHaveBeenCalledWith({
      pageId: 'page-1',
      platformPostId: 'plat-1',
      adAccountId: 'act_1',
      accessToken: 'plain:enc-token',
      budget: 2500,
      durationDays: 7,
      audience: 'followers',
    })
    expect(prisma.postBoost.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', status: { in: ['ENDED', 'CANCELLED', 'FAILED'] } },
    })
    expect(prisma.postBoost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        postId: 'post-1', adCampaignId: 'c1', adSetId: 's1', adId: 'a1', status: 'ACTIVE',
      }),
    })
    expect(result).toMatchObject({ id: 'boost-1', adCampaignId: 'c1' })
  })

  it('propagates a Meta API failure without creating a boost row', async () => {
    vi.mocked(createBoost).mockRejectedValue(new Error('ad account suspended'))

    await expect(
      createPostBoost({
        postId: 'post-1', platform: 'FACEBOOK', platformPostId: 'plat-1', pageId: 'page-1',
        adAccountId: 'act_1', encryptedAccessToken: 'enc-token',
        budget: 2500, durationDays: 7, audience: 'followers',
      })
    ).rejects.toThrow('ad account suspended')

    expect(prisma.postBoost.create).not.toHaveBeenCalled()
  })
})

describe('checkCancelEligibility', () => {
  it('allows an active boost with a valid access token', () => {
    const result = checkCancelEligibility({
      boost: { status: 'ACTIVE' },
      socialAccount: { accessToken: 'enc-token' },
    })
    expect(result).toEqual({ eligible: true })
  })

  it('rejects when there is no boost at all', () => {
    const result = checkCancelEligibility({ boost: null, socialAccount: { accessToken: 'enc-token' } })
    expect(result).toEqual({ eligible: false, status: 400, error: 'No active boost to cancel' })
  })

  it('rejects a boost that is not ACTIVE', () => {
    const result = checkCancelEligibility({
      boost: { status: 'CANCELLED' },
      socialAccount: { accessToken: 'enc-token' },
    })
    expect(result).toEqual({ eligible: false, status: 400, error: 'No active boost to cancel' })
  })

  it('rejects a missing access token', () => {
    const result = checkCancelEligibility({ boost: { status: 'ACTIVE' }, socialAccount: { accessToken: null } })
    expect(result).toEqual({ eligible: false, status: 400, error: 'This account has no access token.' })
  })
})

describe('cancelPostBoost', () => {
  it('decrypts the token, cancels on Meta, and marks the boost CANCELLED', async () => {
    vi.mocked(prisma.postBoost.update).mockResolvedValue({ id: 'boost-1', status: 'CANCELLED' } as never)

    const result = await cancelPostBoost('boost-1', 'camp-1', 'enc-token')

    expect(decrypt).toHaveBeenCalledWith('enc-token')
    expect(cancelBoost).toHaveBeenCalledWith({ adCampaignId: 'camp-1', accessToken: 'plain:enc-token' })
    expect(prisma.postBoost.update).toHaveBeenCalledWith({
      where: { id: 'boost-1' },
      data: { status: 'CANCELLED' },
    })
    expect(result).toEqual({ id: 'boost-1', status: 'CANCELLED' })
  })

  it('propagates a Meta cancellation failure without updating the boost row', async () => {
    vi.mocked(cancelBoost).mockRejectedValue(new Error('meta unreachable'))

    await expect(cancelPostBoost('boost-1', 'camp-1', 'enc-token')).rejects.toThrow('meta unreachable')
    expect(prisma.postBoost.update).not.toHaveBeenCalled()
  })
})
