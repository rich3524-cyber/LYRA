import { resolveWorkspaceId } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { CAPABILITY_REGISTRY } from '../capabilities/registry'

interface SearchCapabilitiesParams {
  query: string
  workspace_id?: string
}

interface CapabilityMatch {
  name: string
  description: string
  available: boolean
  requires?: string
}

// Simple keyword/substring match against name + description -- no embeddings
// or semantic search needed at 15 entries. Per the parent spec, a match the
// caller's plan doesn't cover is still returned, marked unavailable with the
// tier that would unlock it, rather than filtered out silently -- a cleaner
// upsell than a dead end.
export async function searchCapabilities(params: SearchCapabilitiesParams, bearerToken: string): Promise<CapabilityMatch[]> {
  const workspaceId = await resolveWorkspaceId(params.workspace_id, bearerToken)
  const needle = params.query.toLowerCase()

  const matches = Object.entries(CAPABILITY_REGISTRY).filter(
    ([name, cap]) => name.toLowerCase().includes(needle) || cap.description.toLowerCase().includes(needle)
  )

  return Promise.all(
    matches.map(async ([name, cap]) => {
      const available = await meetsPlanTier(workspaceId, cap.minPlanTier, bearerToken)
      return available
        ? { name, description: cap.description, available: true }
        : { name, description: cap.description, available: false, requires: cap.minPlanTier }
    })
  )
}
