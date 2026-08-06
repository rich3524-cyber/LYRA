import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn(), postLyraApi: vi.fn(), deleteLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))
vi.mock('../capabilities/plan-tier', () => ({ meetsPlanTier: vi.fn() }))

import { callLyraApi, postLyraApi, deleteLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { callCapability, CapabilityNotFoundError, CapabilityAccessDeniedError } from './call-capability'

describe('callCapability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
    vi.mocked(meetsPlanTier).mockResolvedValue(true)
  })

  it('throws CapabilityNotFoundError for an unknown capability name', async () => {
    await expect(
      callCapability({ name: 'not_a_real_capability', params: {}, workspace_id: 'ws-1' }, 'token-abc')
    ).rejects.toThrow(CapabilityNotFoundError)
    expect(callLyraApi).not.toHaveBeenCalled()
  })

  it('rejects invalid params against the capability\'s own schema before making any API call', async () => {
    // add_competitor requires a non-empty `name`
    await expect(
      callCapability({ name: 'add_competitor', params: {}, workspace_id: 'ws-1' }, 'token-abc')
    ).rejects.toThrow(/name/i)
    expect(postLyraApi).not.toHaveBeenCalled()
  })

  it('throws CapabilityAccessDeniedError when the workspace plan is below the capability\'s minPlanTier', async () => {
    vi.mocked(meetsPlanTier).mockResolvedValue(false)

    await expect(
      callCapability({ name: 'list_competitors', params: {}, workspace_id: 'ws-1' }, 'token-abc')
    ).rejects.toThrow(CapabilityAccessDeniedError)
    expect(callLyraApi).not.toHaveBeenCalled()
  })

  it('dispatches a GET capability with no params as a query-string-free call', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'comp-1', name: 'Acme Co' }])

    const result = await callCapability({ name: 'list_competitors', params: {}, workspace_id: 'ws-1' }, 'token-abc')

    expect(callLyraApi).toHaveBeenCalledWith('/api/competitors', 'token-abc', { workspaceId: 'ws-1' })
    expect(result).toEqual([{ id: 'comp-1', name: 'Acme Co' }])
  })

  it('dispatches a POST capability with workspaceId merged into the body', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ id: 'comp-2', name: 'Acme Co' })

    await callCapability({ name: 'add_competitor', params: { name: 'Acme Co' }, workspace_id: 'ws-1' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/competitors', 'token-abc', { workspaceId: 'ws-1', name: 'Acme Co' })
  })

  it('substitutes a :placeholder path param and does NOT forward it as a query/body field', async () => {
    vi.mocked(deleteLyraApi).mockResolvedValue({ ok: true })

    await callCapability({ name: 'remove_competitor', params: { id: 'comp-1' }, workspace_id: 'ws-1' }, 'token-abc')

    expect(deleteLyraApi).toHaveBeenCalledWith('/api/competitors/comp-1', 'token-abc')
  })

  it('substitutes a :placeholder path param on a POST capability with an otherwise-empty body', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ seoScore: 82 })

    await callCapability({ name: 'analyze_seo_page', params: { pageId: 'page-1' }, workspace_id: 'ws-1' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/seo/pages/page-1/analyze', 'token-abc', {})
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([])
    await callCapability({ name: 'list_competitors', params: {} } as any, 'token-abc')
    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
  })

  it('propagates errors from the underlying API client unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(callLyraApi).mockRejectedValue(new LyraApiError(422, {}))

    await expect(
      callCapability({ name: 'list_competitors', params: {}, workspace_id: 'ws-1' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
