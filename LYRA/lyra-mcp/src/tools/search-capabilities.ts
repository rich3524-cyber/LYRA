import { resolveWorkspaceId } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { CAPABILITY_REGISTRY, type CapabilityDefinition } from '../capabilities/registry'

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

// Tokenized match against name + description -- no embeddings or semantic
// search needed at 15 entries. Requiring every token to appear somewhere in
// the haystack (rather than one substring match on the whole query) is what
// makes realistic multi-word LLM queries like "competitor tracking" or
// "tools for tracking competitors" actually match -- a single substring test
// would require that exact phrase to appear verbatim, which no name or
// description does.
//
// Strict AND still isn't enough on its own: queries like "brand intelligence
// tools" or "SEO tools" use words ("intelligence", "tools") that appear in
// no capability's name/description at all (only in internal API paths, or
// nowhere), so AND-ing every term returns zero results even though several
// capabilities are obviously relevant. So: try AND first: if that finds
// anything, trust it completely (it's a strictly better signal than OR).
// Only if AND comes up empty do we fall back to OR, ranked by how many terms
// matched -- a partial match beats a dead end for an LLM caller deciding
// whether to try call_capability at all.
//
// Exported so callers that only need the search results (not the plan-tier
// availability check, which needs a real workspace/token) can use the same
// matching logic -- e.g. the tool-selection eval harness, which simulates a
// search_capabilities result without a live backend.
export function matchCapabilityEntries(query: string): Array<[string, CapabilityDefinition]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const entries = Object.entries(CAPABILITY_REGISTRY)
  const haystackFor = ([name, cap]: [string, CapabilityDefinition]) => `${name} ${cap.description}`.toLowerCase()

  const andMatches = entries.filter((entry) => terms.every((t) => haystackFor(entry).includes(t)))
  if (andMatches.length > 0) return andMatches

  // Fallback: no capability matched every term. Rank by how many terms
  // matched instead of returning nothing.
  const scored = entries
    .map((entry) => ({ entry, score: terms.filter((t) => haystackFor(entry).includes(t)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map((s) => s.entry)
}

// Per the parent spec, a match the caller's plan doesn't cover is still
// returned, marked unavailable with the tier that would unlock it, rather
// than filtered out silently -- a cleaner upsell than a dead end.
export async function searchCapabilities(params: SearchCapabilitiesParams, bearerToken: string): Promise<CapabilityMatch[]> {
  const workspaceId = await resolveWorkspaceId(params.workspace_id, bearerToken)
  const matches = matchCapabilityEntries(params.query)

  return Promise.all(
    matches.map(async ([name, cap]) => {
      const available = await meetsPlanTier(workspaceId, cap.minPlanTier, bearerToken)
      return available
        ? { name, description: cap.description, available: true }
        : { name, description: cap.description, available: false, requires: cap.minPlanTier }
    })
  )
}
