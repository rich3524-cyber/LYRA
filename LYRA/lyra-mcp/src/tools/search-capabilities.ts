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
  // Sourced straight from the registry entry so a caller deciding whether
  // to invoke a search result can tell, without a second lookup, whether
  // doing so will change data -- previously this flag existed on every
  // registry entry but was never threaded through to search results.
  mutates: boolean
  // Whether the caller's plan tier covers this capability. Left `undefined`
  // (rather than a fabricated `true`/`false`) when availability couldn't
  // actually be determined -- see the resolveWorkspaceId failure handling
  // in searchCapabilities below, for a caller with access to multiple
  // workspaces who didn't specify which one.
  available?: boolean
  requires?: PlanTier
}

// Common words plus 1-2 letter terms are stripped from a query before
// scoring the OR fallback -- see matchCapabilityEntries for why.
const STOPWORDS = new Set(['a', 'an', 'and', 'for', 'the', 'to', 'of', 'in', 'on', 'my', 'me', 'i', 'do', 'how', 'with', 'what', 'can', 'is', 'it'])

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
// Two refinements on top of raw term-counting, both needed once real LLM
// phrasing (not just keyword queries) is in play:
//  - Stopwords and single/double-letter terms are stripped before scoring.
//    Without this, a query like "how do I schedule a post" scores "i" and
//    "a" as real terms -- both are substrings of nearly every description,
//    so the OR fallback degenerates into "return almost the whole registry."
//    Falls back to the raw terms if stripping would leave nothing, so a
//    query that's *entirely* stopwords is never worse off than before.
//  - A match in the capability's name counts double a match only in its
//    description. A name match is a much stronger relevance signal (it's
//    what the capability fundamentally *is*), so it should be able to
//    outrank a capability that only happens to mention a term in passing.
//
// Exported (rather than kept private to searchCapabilities) so callers that
// only need the search results -- not the plan-tier availability check,
// which needs a real workspace/bearer token -- can reuse this same matching
// logic. The tool-selection eval harness is the motivating case: it
// simulates a search_capabilities result without a live backend.
export function matchCapabilityEntries(query: string): Array<[string, CapabilityDefinition]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const meaningful = terms.filter((t) => t.length > 2 && !STOPWORDS.has(t))
  const effective = meaningful.length > 0 ? meaningful : terms

  const scored = Object.entries(CAPABILITY_REGISTRY).map(([name, cap]) => {
    const nameHay = name.toLowerCase()
    const haystack = `${nameHay} ${cap.description.toLowerCase()}`
    const score = effective.reduce((n, t) => n + (haystack.includes(t) ? (nameHay.includes(t) ? 2 : 1) : 0), 0)
    const matchesAll = effective.every((t) => haystack.includes(t))
    return { entry: [name, cap] as [string, CapabilityDefinition], score, matchesAll }
  })

  const andMatches = scored.filter((s) => s.matchesAll)
  if (andMatches.length > 0) return andMatches.map((s) => s.entry)

  // Fallback: no capability matched every term. Rank by weighted score
  // instead of returning nothing.
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.entry)
}

// Per the parent spec, a match the caller's plan doesn't cover is still
// returned, marked unavailable with the tier that would unlock it, rather
// than filtered out silently -- a cleaner upsell than a dead end.
export async function searchCapabilities(params: SearchCapabilitiesParams, bearerToken: string): Promise<CapabilityMatch[]> {
  const matches = matchCapabilityEntries(params.query)

  // The keyword match above needs no workspace at all -- only the
  // plan-tier availability check below does. resolveWorkspaceId throws when
  // workspace_id is omitted and the caller has access to more than one
  // workspace (genuinely ambiguous which one is meant). Previously that
  // throw took down the whole function, so an ambiguous-workspace caller
  // got nothing back even though the search itself was still answerable.
  // Now: catch it, still return the match list, and leave `available`
  // undefined on every result rather than fabricating a true/false that
  // wasn't actually determined -- the caller can retry with an explicit
  // workspace_id to get real availability.
  let workspaceId: string
  try {
    workspaceId = await resolveWorkspaceId(params.workspace_id, bearerToken)
  } catch {
    return matches.map(([name, cap]) => ({
      name,
      description: cap.description,
      mutates: cap.mutates,
      available: undefined,
    }))
  }

  return Promise.all(
    matches.map(async ([name, cap]) => {
      const available = await meetsPlanTier(workspaceId, cap.minPlanTier, bearerToken)
      return available
        ? { name, description: cap.description, mutates: cap.mutates, available: true }
        : { name, description: cap.description, mutates: cap.mutates, available: false, requires: cap.minPlanTier }
    })
  )
}
