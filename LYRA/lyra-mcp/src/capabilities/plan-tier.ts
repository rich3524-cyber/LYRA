import { callLyraApi } from '../lyra-api-client'

type PlanTier = 'STARTER' | 'PRO' | 'AGENCY'

const TIER_RANK: Record<PlanTier, number> = { STARTER: 0, PRO: 1, AGENCY: 2 }

interface WorkspaceRef {
  id: string
  plan: PlanTier
}

// Fail-closed by design: a workspace lookup failure or an unrecognized
// workspace both resolve to "does not meet the tier" rather than silently
// allowing the call through. This gates a real product boundary (paid-tier
// features), so the safe default matters here in a way it doesn't for the
// purely-cosmetic getWorkspaceName lookup.
export async function meetsPlanTier(workspaceId: string, minTier: PlanTier, bearerToken: string): Promise<boolean> {
  if (minTier === 'STARTER') return true
  const workspaces = await callLyraApi<WorkspaceRef[]>('/api/workspaces', bearerToken)
  const workspace = workspaces.find((w) => w.id === workspaceId)
  if (!workspace) return false
  return TIER_RANK[workspace.plan] >= TIER_RANK[minTier]
}
