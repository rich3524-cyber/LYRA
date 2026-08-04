import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { callLyraApi, LyraApiError } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getBrandProfile } from './get-brand-profile'

describe('getBrandProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('calls the brand profile endpoint with workspace_id and returns it unchanged', async () => {
    vi.mocked(callLyraApi).mockResolvedValue({
      voiceSummary: 'Friendly, direct',
      toneAttributes: ['warm'],
      contentThemes: ['community'],
      guardrails: [{ type: 'NEVER_DISCUSS', value: 'pricing' }],
      workspaceId: 'ws-1',
    })

    const result = await getBrandProfile({ workspace_id: 'ws-1' }, 'token-abc')

    expect(callLyraApi).toHaveBeenCalledWith('/api/brand-intelligence/profile', 'token-abc', { workspaceId: 'ws-1' })
    expect(result).toEqual({
      voiceSummary: 'Friendly, direct',
      toneAttributes: ['warm'],
      contentThemes: ['community'],
      guardrails: [{ type: 'NEVER_DISCUSS', value: 'pricing' }],
    })
    expect(result).not.toHaveProperty('workspaceId')
  })

  it('propagates errors from callLyraApi unchanged', async () => {
    vi.mocked(callLyraApi).mockRejectedValue(new LyraApiError(500, {}))

    await expect(getBrandProfile({ workspace_id: 'ws-1' }, 'token-abc')).rejects.toThrow(LyraApiError)
  })

  it('delegates workspace_id resolution to resolveWorkspaceId and uses its resolved value', async () => {
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-resolved')
    vi.mocked(callLyraApi).mockResolvedValue({
      voiceSummary: 'Friendly, direct',
      toneAttributes: ['warm'],
      contentThemes: ['community'],
      guardrails: [],
    })

    await getBrandProfile({} as any, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(callLyraApi).toHaveBeenCalledWith('/api/brand-intelligence/profile', 'token-abc', { workspaceId: 'ws-resolved' })
  })

  it('propagates errors thrown by resolveWorkspaceId', async () => {
    vi.mocked(resolveWorkspaceId).mockRejectedValue(new Error('workspace_id is required: caller has access to multiple workspaces (A, B) -- specify which one'))

    await expect(getBrandProfile({} as any, 'token-abc')).rejects.toThrow('multiple workspaces')
    expect(callLyraApi).not.toHaveBeenCalled()
  })
})
