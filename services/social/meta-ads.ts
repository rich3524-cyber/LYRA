export async function getBoostReach(_params: Record<string, unknown>): Promise<{ min: number; max: number }> {
  throw new Error('Meta Ads not configured')
}

export async function createBoost(_params: Record<string, unknown>): Promise<{ adCampaignId: string; adSetId: string; adId: string }> {
  throw new Error('Meta Ads not configured')
}

export async function cancelBoost(_params: { adCampaignId: string; accessToken: string }): Promise<void> {
  throw new Error('Meta Ads not configured')
}
