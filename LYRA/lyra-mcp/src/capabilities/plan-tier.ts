import { callLyraApi } from '../lyra-api-client'

type PlanTier = 'STARTER' | 'PRO' | 'AGENCY'

const TIER_RANK: Record<PlanTier, number> = { STARTER: 0, PRO: 1, AGENCY: 2 }

interface WorkspaceRef {
  id: string
  plan: PlanTier
}

// Fail-closed by design: a workspace that isn't found in the caller's
// workspace list resolves to "does not meet the tier" rather than silently
// allowing the call through. This gates a real product boundary (paid-tier
// features), so the safe default matters here in a way it doesn't for the
// purely-cosmetic getWorkspaceName lookup. (A callLyraApi rejection --
// timeout, network error, 401 -- is not caught here and propagates to the
// caller uncaught; this function only fails closed on the "workspace not
// in the list" case.)
export async function meetsPlanTier(workspaceId: string, minTier: PlanTier, bearerToken: string): Promise<boolean> {
  if (minTier === 'STARTER') return true
  const workspaces = await callLyraApi<WorkspaceRef[]>('/api/workspaces', bearerToken)
  const workspace = workspaces.find((w) => w.id === workspaceId)
  if (!workspace) return false
  return TIER_RANK[workspace.plan] >= TIER_RANK[minTier]
}
