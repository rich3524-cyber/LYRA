const BASE = 'https://graph.facebook.com/v19.0'

export interface BoostResult {
  adCampaignId: string
  adSetId: string
  adId: string
}

export interface CreateBoostParams {
  pageId: string
  platformPostId: string
  adAccountId: string
  accessToken: string
  budget: number       // total budget in cents (e.g. 2500 = $25)
  durationDays: number
  audience: 'followers' | 'followers_lookalike' | 'broad'
}

export interface CancelBoostParams {
  adCampaignId: string
  accessToken: string
}

export interface GetBoostReachParams {
  adCampaignId: string
  accessToken: string
}

function audienceSpec(pageId: string, audience: CreateBoostParams['audience']) {
  switch (audience) {
    case 'followers':
      return { connections: [pageId] }
    case 'followers_lookalike':
      return { connections: [pageId], interests: [] }
    case 'broad':
      return { geo_locations: { countries: ['AU'] } }
  }
}

async function metaPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if (data.error) {
    const err = data.error as { message: string }
    throw new Error(err.message)
  }
  return data
}

export async function createBoost(params: CreateBoostParams): Promise<BoostResult> {
  const { pageId, platformPostId, adAccountId, accessToken, budget, durationDays, audience } = params
  const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

  // Step 1: Create Campaign
  const campaign = await metaPost(`/act_${adAccountId}/campaigns`, {
    name: `LYRA Boost — ${platformPostId}`,
    objective: 'POST_ENGAGEMENT',
    status: 'ACTIVE',
    access_token: accessToken,
  })
  const adCampaignId = campaign.id as string

  // Step 2: Create AdSet
  const adSet = await metaPost(`/act_${adAccountId}/adsets`, {
    name: `LYRA AdSet — ${platformPostId}`,
    campaign_id: adCampaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'POST_ENGAGEMENT',
    lifetime_budget: budget,
    end_time: Math.floor(endsAt.getTime() / 1000),
    targeting: audienceSpec(pageId, audience),
    status: 'ACTIVE',
    access_token: accessToken,
  })
  const adSetId = adSet.id as string

  // Step 3: Create Creative
  const creative = await metaPost(`/act_${adAccountId}/adcreatives`, {
    name: `LYRA Creative — ${platformPostId}`,
    object_story_id: `${pageId}_${platformPostId}`,
    access_token: accessToken,
  })
  const creativeId = creative.id as string

  // Step 4: Create Ad
  const ad = await metaPost(`/act_${adAccountId}/ads`, {
    name: `LYRA Ad — ${platformPostId}`,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: 'ACTIVE',
    access_token: accessToken,
  })
  const adId = ad.id as string

  return { adCampaignId, adSetId, adId }
}

export async function cancelBoost(params: CancelBoostParams): Promise<void> {
  await metaPost(`/${params.adCampaignId}`, {
    status: 'PAUSED',
    access_token: params.accessToken,
  })
}

export async function getBoostReach(params: GetBoostReachParams): Promise<number> {
  const res = await fetch(
    `${BASE}/${params.adCampaignId}/insights?fields=impressions&access_token=${params.accessToken}`
  )
  const data = await res.json() as { data?: { impressions?: string }[] }
  const impressions = data.data?.[0]?.impressions
  return impressions ? parseInt(impressions, 10) : 0
}
