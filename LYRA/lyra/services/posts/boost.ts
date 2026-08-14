// services/posts/boost.ts
//
// Business rules and Meta-Ads orchestration for boosting/cancelling a
// published post -- split out of app/api/posts/[id]/boost/route.ts (POST and
// DELETE) so the request-validation and plan/publish-state eligibility rules
// are unit-testable without spinning up a route handler. Matches the
// services/posts/bulk-import.ts pattern: one file, DB and external-API calls
// included, no separate pure/impure split (that split in
// services/posts/post-lifecycle.ts exists specifically to keep it
// frontend-importable, which doesn't apply here).
import type { Platform } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { createBoost, cancelBoost } from '@/services/social/meta-ads'

export const VALID_BUDGETS = [1000, 2500, 5000, 10000] as const
export const VALID_DURATIONS = [3, 7, 14, 30] as const
export const VALID_AUDIENCES = ['followers', 'followers_lookalike', 'broad'] as const

export type BoostAudience = (typeof VALID_AUDIENCES)[number]

export interface BoostRequestBody {
  budget?: number
  durationDays?: number
  audience?: string
}

export type BoostRequestValidation =
  | { valid: true; budget: number; durationDays: number; audience: BoostAudience }
  | { valid: false; error: string }

/**
 * Same four sequential checks the route used to run inline, in the same
 * order (presence, then each field's allow-list) -- error messages and
 * ordering are load-bearing for the route's existing test coverage.
 */
export function validateBoostRequest(body: BoostRequestBody): BoostRequestValidation {
  const { budget, durationDays, audience } = body

  if (!budget || !durationDays || !audience) {
    return { valid: false, error: 'budget, durationDays, and audience required' }
  }
  if (!(VALID_BUDGETS as readonly number[]).includes(budget)) {
    return { valid: false, error: 'Invalid budget. Choose $10, $25, $50, or $100.' }
  }
  if (!(VALID_DURATIONS as readonly number[]).includes(durationDays)) {
    return { valid: false, error: 'Invalid duration. Choose 3, 7, 14, or 30 days.' }
  }
  if (!(VALID_AUDIENCES as readonly string[]).includes(audience)) {
    return { valid: false, error: 'Invalid audience option.' }
  }

  return { valid: true, budget, durationDays, audience: audience as BoostAudience }
}

export interface BoostEligibilityPost {
  status: string
  platformPostId: string | null
  workspace: { plan: string }
  socialAccount: {
    platform: string
    adAccountId: string | null
    accessToken: string | null
  }
}

export type BoostEligibility =
  | { eligible: true }
  | { eligible: false; status: number; error: string }

/**
 * Same order and status/error shape the route checked inline: plan gate,
 * publish state, platform allow-list, ad account presence, access token
 * presence.
 */
export function checkBoostEligibility(post: BoostEligibilityPost): BoostEligibility {
  if (post.workspace.plan === 'STARTER') {
    return { eligible: false, status: 403, error: 'Boosting requires Pro or Agency plan' }
  }
  if (post.status !== 'PUBLISHED' || !post.platformPostId) {
    return { eligible: false, status: 400, error: 'Post must be published to boost' }
  }

  const platform = post.socialAccount.platform
  if (platform !== 'FACEBOOK' && platform !== 'INSTAGRAM') {
    return { eligible: false, status: 400, error: 'Boosting is only available for Facebook and Instagram posts' }
  }
  if (!post.socialAccount.adAccountId) {
    return {
      eligible: false,
      status: 400,
      error: 'No Facebook Ad Account connected. Connect one in Facebook Business Manager.',
    }
  }
  if (!post.socialAccount.accessToken) {
    return { eligible: false, status: 400, error: 'This account has no access token.' }
  }

  return { eligible: true }
}

export interface CreatePostBoostInput {
  postId: string
  platform: Platform
  platformPostId: string
  pageId: string
  adAccountId: string
  encryptedAccessToken: string
  budget: number
  durationDays: number
  audience: BoostAudience
}

/**
 * Calls Meta to create the campaign/adset/creative/ad chain, then records
 * the boost -- clearing out any previous ended/cancelled/failed boost row
 * for this post first, exactly as the route did inline. Throws on a Meta
 * API failure (the route's outer catch turns that into a 500); does not
 * itself decide HTTP status.
 */
export async function createPostBoost(input: CreatePostBoostInput) {
  const accessToken = decrypt(input.encryptedAccessToken)
  const endsAt = new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000)

  const { adCampaignId, adSetId, adId } = await createBoost({
    pageId: input.pageId,
    platformPostId: input.platformPostId,
    adAccountId: input.adAccountId,
    accessToken,
    budget: input.budget,
    durationDays: input.durationDays,
    audience: input.audience,
  })

  // Remove any existing ended/cancelled boost for this post before creating the new one
  await prisma.postBoost.deleteMany({
    where: {
      postId: input.postId,
      status: { in: ['ENDED', 'CANCELLED', 'FAILED'] },
    },
  })

  return prisma.postBoost.create({
    data: {
      postId: input.postId,
      platform: input.platform,
      adCampaignId,
      adSetId,
      adId,
      budget: input.budget,
      durationDays: input.durationDays,
      audience: input.audience,
      status: 'ACTIVE',
      endsAt,
    },
  })
}

export interface CancelEligibilityPost {
  boost: { status: string } | null
  socialAccount: { accessToken: string | null }
}

export type CancelEligibility =
  | { eligible: true }
  | { eligible: false; status: number; error: string }

export function checkCancelEligibility(post: CancelEligibilityPost): CancelEligibility {
  if (!post.boost || post.boost.status !== 'ACTIVE') {
    return { eligible: false, status: 400, error: 'No active boost to cancel' }
  }
  if (!post.socialAccount.accessToken) {
    return { eligible: false, status: 400, error: 'This account has no access token.' }
  }
  return { eligible: true }
}

/**
 * Deletes the campaign on Meta then marks the boost CANCELLED. If the Meta
 * call throws, the DB row is deliberately left ACTIVE (matches the route's
 * original comment: "if this fails, we return an error and leave status as
 * ACTIVE") -- the caller's catch block turns the throw into an error
 * response without this function attempting any rollback of its own.
 */
export async function cancelPostBoost(boostId: string, adCampaignId: string, encryptedAccessToken: string) {
  const accessToken = decrypt(encryptedAccessToken)
  await cancelBoost({ adCampaignId, accessToken })
  return prisma.postBoost.update({
    where: { id: boostId },
    data: { status: 'CANCELLED' },
  })
}
