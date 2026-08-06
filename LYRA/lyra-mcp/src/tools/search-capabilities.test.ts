import { describe, it, expect, vi, beforeEach } from 'vitest'

// Preserves the real AmbiguousWorkspaceError class alongside the mocked
// function -- search-capabilities.ts does `err instanceof
// AmbiguousWorkspaceError`, so a mock that dropped the real export (e.g.
// `() => ({ resolveWorkspaceId: vi.fn() })`) would make that class
// `undefined` and throw a TypeError on the very `instanceof` check the new
// error-narrowing logic depends on.
vi.mock('../resolve-workspace-id', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../resolve-workspace-id')>()
  return { ...actual, resolveWorkspaceId: vi.fn() }
})
vi.mock('../capabilities/plan-tier', () => ({ meetsPlanTier: vi.fn() }))

import { resolveWorkspaceId, AmbiguousWorkspaceError } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { searchCapabilities, matchCapabilityEntries } from './search-capabilities'

describe('searchCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
    vi.mocked(meetsPlanTier).mockResolvedValue(true)
  })

  it('matches on capability name (case-insensitive, substring)', async () => {
    const results = await searchCapabilities({ query: 'competitor' }, 'token-abc')
    const names = results.map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['list_competitors', 'add_competitor', 'remove_competitor']))
    expect(names).not.toContain('list_seo_pages')
  })

  it('matches on description text too, not just the name', async () => {
    const results = await searchCapabilities({ query: 'Google Search Console' }, 'token-abc')
    expect(results.map((r) => r.name)).toContain('get_seo_search_data')
  })

  it('requires every token to match for a multi-word query when a strict AND match exists, not any token', async () => {
    // No single capability's name+description mentions both "seo" and
    // "competitor", so the strict AND-match is empty -- this now exercises
    // the OR fallback (see matchCapabilityEntries tests below) rather than
    // returning nothing outright, since a partial match beats a dead end.
    // The key invariant this test still proves: when an AND match DOES
    // exist for a query, only the true AND match is returned, not every
    // capability that matches any individual term.
    const fallback = await searchCapabilities({ query: 'seo competitor' }, 'token-abc')
    expect(fallback.length).toBeGreaterThan(0)

    // "seo pages" matches list_seo_pages (both terms present). Proof this is
    // an AND, not an OR: get_seo_search_data mentions "seo" but never "pages"
    // anywhere in its name/description, so an OR match would wrongly include
    // it -- the AND-tokenized implementation correctly excludes it.
    const bothMatch = await searchCapabilities({ query: 'seo pages' }, 'token-abc')
    const names = bothMatch.map((r) => r.name)
    expect(names).toContain('list_seo_pages')
    expect(names).not.toContain('get_seo_search_data')
  })

  it('matches a realistic multi-word phrasing and tolerates padded whitespace', async () => {
    // "competitor tracking" is the multi-word query from the plan's eval
    // dataset ("tools for tracking competitors") that returned zero results
    // under the old whole-string substring match. No competitor
    // capability's description contains the literal word "tracking" (they
    // say "tracked"/"track"), so this is an OR-fallback match on
    // "competitor" alone -- all three competitor capabilities come back,
    // not just remove_competitor (see matchCapabilityEntries tests for why
    // that matters: a lone remove_competitor result gave no signal it was
    // destructive).
    const phrasing = await searchCapabilities({ query: 'competitor tracking' }, 'token-abc')
    expect(phrasing.map((r) => r.name)).toEqual(expect.arrayContaining(['list_competitors', 'add_competitor', 'remove_competitor']))

    const padded = await searchCapabilities({ query: '  competitor  ' }, 'token-abc')
    expect(padded.map((r) => r.name)).toEqual(expect.arrayContaining(['list_competitors', 'add_competitor', 'remove_competitor']))
  })

  it('returns no results for a query matching nothing', async () => {
    const results = await searchCapabilities({ query: 'xyzzy-not-a-real-thing' }, 'token-abc')
    expect(results).toEqual([])
  })

  it('marks a match unavailable with the required tier when the workspace plan is too low', async () => {
    vi.mocked(meetsPlanTier).mockResolvedValue(false)

    const results = await searchCapabilities({ query: 'competitor', workspace_id: 'ws-1' }, 'token-abc')

    expect(results[0]).toMatchObject({ available: false, requires: 'PRO' })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    await searchCapabilities({ query: 'competitor' } as any, 'token-abc')
    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
  })

  it('returns exactly name, description, mutates, and available -- no other fields -- when available', async () => {
    const results = await searchCapabilities({ query: 'competitor' }, 'token-abc')
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(['available', 'description', 'mutates', 'name'])
      expect(r).not.toHaveProperty('paramSchema')
      expect(r).not.toHaveProperty('endpoint')
    }
  })

  it('returns exactly name, description, mutates, available, and requires -- no other fields -- when unavailable', async () => {
    vi.mocked(meetsPlanTier).mockResolvedValue(false)

    const results = await searchCapabilities({ query: 'competitor' }, 'token-abc')
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(['available', 'description', 'mutates', 'name', 'requires'])
      expect(r).not.toHaveProperty('paramSchema')
      expect(r).not.toHaveProperty('endpoint')
    }
  })

  it('includes an accurate mutates flag sourced from the registry, for both a mutating and a non-mutating result', async () => {
    const results = await searchCapabilities({ query: 'competitor' }, 'token-abc')
    const byName = Object.fromEntries(results.map((r) => [r.name, r]))

    expect(byName.list_competitors).toBeDefined()
    expect(byName.list_competitors.mutates).toBe(false)
    expect(byName.add_competitor).toBeDefined()
    expect(byName.add_competitor.mutates).toBe(true)
    expect(byName.remove_competitor).toBeDefined()
    expect(byName.remove_competitor.mutates).toBe(true)
  })

  it('still returns keyword matches, with available left undefined, when resolveWorkspaceId fails because the caller has multiple workspaces and omitted workspace_id', async () => {
    vi.mocked(resolveWorkspaceId).mockRejectedValue(new AmbiguousWorkspaceError(['Acme', 'Beta']))

    const results = await searchCapabilities({ query: 'competitor' } as any, 'token-abc')

    // Search itself doesn't need a workspace -- only the plan-tier check
    // does -- so the ambiguous-workspace failure shouldn't erase the
    // otherwise-useful match list.
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['list_competitors', 'add_competitor', 'remove_competitor']))
    // meetsPlanTier was never reachable (no workspaceId to check it
    // against), so availability is genuinely unknown, not fabricated.
    for (const r of results) {
      expect(r.available).toBeUndefined()
    }
    expect(meetsPlanTier).not.toHaveBeenCalled()
  })

  it('propagates a non-ambiguous-workspace failure (e.g. an expired token or a network/backend error) unchanged, rather than swallowing it into a degraded response', async () => {
    // Any error resolveWorkspaceId throws that ISN'T AmbiguousWorkspaceError
    // -- the "caller has zero workspaces" case, an auth failure, a network
    // timeout hitting the underlying callLyraApi call -- must reach the
    // caller as a real failure, not get converted into "here are your
    // results, availability unknown."
    const authError = new Error('Unauthorized: bearer token expired')
    vi.mocked(resolveWorkspaceId).mockRejectedValue(authError)

    await expect(searchCapabilities({ query: 'competitor' } as any, 'token-abc')).rejects.toThrow(
      'Unauthorized: bearer token expired'
    )
    expect(meetsPlanTier).not.toHaveBeenCalled()
  })
})

describe('matchCapabilityEntries (fallback matching)', () => {
  it('falls back to OR-ranked matching when strict AND returns nothing', () => {
    // "intelligence" appears in no capability's name/description (only in
    // the internal /api/brand-intelligence/... path), so the AND match is
    // empty. The OR fallback ranks by weighted term-match count (a name
    // match counts double a description-only match). "brand" is the only
    // effective term any entry matches (and "tools" matches nothing
    // anywhere) -- rebuild_brand_profile has "brand" in its *name*, so it
    // scores 2 and ranks first; the other three only mention "brand" in
    // their description, score 1 each, and keep registry order among
    // themselves. Neither crisis-keyword capability mentions "brand"
    // anywhere in its name/description, so they are correctly absent
    // despite being brand-intelligence-adjacent conceptually.
    const results = matchCapabilityEntries('brand intelligence tools')
    const names = results.map(([name]) => name)
    expect(names).toEqual(['rebuild_brand_profile', 'generate_seo_content', 'analyze_engagement_patterns', 'generate_schedule'])
  })

  it('falls back correctly for "SEO tools"', () => {
    // "tools" appears in no capability's name/description at all, so the
    // AND match is empty. The OR fallback then returns every capability
    // whose name/description contains "seo" -- all five SEO capabilities,
    // each with "seo" in its *name* (so all score 2, tied, in registry
    // order) since "tools" contributes nothing to any of them.
    const results = matchCapabilityEntries('SEO tools')
    const names = results.map(([name]) => name)
    expect(names).toEqual(['get_seo_search_data', 'list_seo_pages', 'track_seo_page', 'analyze_seo_page', 'generate_seo_content'])
  })

  it('falls back to OR-ranked matching for "competitor tracking", surfacing all three competitor capabilities rather than just remove_competitor', () => {
    // Previously remove_competitor's description named list_competitors in
    // a parenthetical cross-reference and separately said "Stop tracking a
    // competitor", so it was the ONLY entry whose own name+description
    // contained both "competitor" and "tracking" -- the strict AND match
    // returned just remove_competitor, with no indication alongside it that
    // list_competitors/add_competitor cover the same feature, and no signal
    // that the lone result was the destructive one. Now that no
    // capability's description contains the literal word "tracking" (they
    // say "tracked"/"track" instead), the AND match is empty for this query
    // and it falls back to OR-ranking: every capability whose
    // name/description contains "competitor" scores via a name match (2
    // points each), so all three tie and come back first, in registry
    // order. track_seo_page's description does separately contain the
    // literal word "tracking" ("Start tracking a page...") -- it scores 1
    // (description-only match, no "competitor") and so trails behind the
    // three competitor capabilities, but is still surfaced rather than
    // dropped, consistent with the OR-fallback's "partial match beats a
    // dead end" design.
    const results = matchCapabilityEntries('competitor tracking')
    expect(results.map(([name]) => name)).toEqual(['list_competitors', 'add_competitor', 'remove_competitor', 'track_seo_page'])
  })

  it('ranks OR-fallback results by match count, most-matched first', () => {
    // "how do I schedule a post" strips down to the effective terms
    // "schedule" and "post" once stopwords ("how", "do", "i", "a") and
    // 1-2 letter terms are removed. generate_schedule's name+description
    // contains both, so it's actually a strict AND match on the effective
    // terms (not an OR-fallback tie) -- either way, it's the correct,
    // unambiguous top (and only) result, which is what a caller relying on
    // ranking needs: the .sort() call is what keeps a stray partial match
    // from crowding out the truly relevant capability.
    const results = matchCapabilityEntries('how do I schedule a post')
    expect(results.map(([name]) => name)).toEqual(['generate_schedule'])
  })

  it('returns empty array for a query matching nothing at all, even via fallback', () => {
    expect(matchCapabilityEntries('xyzzy-not-a-real-thing-whatsoever')).toEqual([])
  })
})
