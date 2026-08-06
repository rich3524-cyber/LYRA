import { resolveWorkspaceId } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { CAPABILITY_REGISTRY } from '../capabilities/registry'

type PlanTier = 'STARTER' | 'PRO' | 'AGENCY'

interface SearchCapabilitiesParams {
  query: string
  workspace_id?: string
}

interface CapabilityMatch {
  name: string
  description: string
  available: boolean
  requires?: PlanTier
}

// Tokenized AND match against name + description -- no embeddings or
// semantic search needed at 15 entries. Requiring every token to appear
// somewhere in the haystack (rather than one substring match on the whole
// query) is what makes realistic multi-word LLM queries like "competitor
// tracking" or "tools for tracking competitors" actually match -- a single
// substring test would require that exact phrase to appear verbatim, which
// no name or description does. Per the parent spec, a match the caller's
// plan doesn't cover is still returned, marked unavailable with the tier
// that would unlock it, rather than filtered out silently -- a cleaner
// upsell than a dead end.
export async function searchCapabilities(params: SearchCapabilitiesParams, bearerToken: string): Promise<CapabilityMatch[]> {
  const workspaceId = await resolveWorkspaceId(params.workspace_id, bearerToken)
  const terms = params.query.toLowerCase().split(/\s+/).filter(Boolean)

  const matches = Object.entries(CAPABILITY_REGISTRY).filter(([name, cap]) => {
    const haystack = `${name} ${cap.description}`.toLowerCase()
    return terms.length > 0 && terms.every((t) => haystack.includes(t))
  })

  return Promise.all(
    matches.map(async ([name, cap]) => {
      const available = await meetsPlanTier(workspaceId, cap.minPlanTier, bearerToken)
      return available
        ? { name, description: cap.description, available: true }
        : { name, description: cap.description, available: false, requires: cap.minPlanTier }
    })
  )
}
