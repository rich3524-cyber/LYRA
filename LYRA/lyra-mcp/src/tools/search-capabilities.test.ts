import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))
vi.mock('../capabilities/plan-tier', () => ({ meetsPlanTier: vi.fn() }))

import { resolveWorkspaceId } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { searchCapabilities } from './search-capabilities'

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

  it('requires every token to match for a multi-word query, not any token', async () => {
    // No single capability's name+description mentions both "seo" and
    // "competitor" -- confirms this is an AND across terms, not an OR.
    const noMatch = await searchCapabilities({ query: 'seo competitor' }, 'token-abc')
    expect(noMatch).toEqual([])

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
    // remove_competitor's description ("Stop tracking a competitor...") is
    // the only entry whose name+description contains both "competitor" and
    // "tracking" -- this is the multi-word query from the plan's eval
    // dataset ("tools for tracking competitors") that returned zero results
    // under the old whole-string substring match.
    const phrasing = await searchCapabilities({ query: 'competitor tracking' }, 'token-abc')
    expect(phrasing.map((r) => r.name)).toContain('remove_competitor')

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

  it('returns exactly name, description, and available -- no other fields -- when available', async () => {
    const results = await searchCapabilities({ query: 'competitor' }, 'token-abc')
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(['available', 'description', 'name'])
      expect(r).not.toHaveProperty('paramSchema')
      expect(r).not.toHaveProperty('endpoint')
    }
  })

  it('returns exactly name, description, available, and requires -- no other fields -- when unavailable', async () => {
    vi.mocked(meetsPlanTier).mockResolvedValue(false)

    const results = await searchCapabilities({ query: 'competitor' }, 'token-abc')
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(['available', 'description', 'name', 'requires'])
      expect(r).not.toHaveProperty('paramSchema')
      expect(r).not.toHaveProperty('endpoint')
    }
  })
})
