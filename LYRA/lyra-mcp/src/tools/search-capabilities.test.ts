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

  it('returns only name, description, available, and requires -- not the full schema', async () => {
    const results = await searchCapabilities({ query: 'competitor' }, 'token-abc')
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(expect.arrayContaining(['available', 'description', 'name']))
      expect(r).not.toHaveProperty('paramSchema')
      expect(r).not.toHaveProperty('endpoint')
    }
  })
})
