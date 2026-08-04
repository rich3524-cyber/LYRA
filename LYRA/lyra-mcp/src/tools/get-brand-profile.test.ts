import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', () => ({ callLyraApi: vi.fn() }))

import { callLyraApi } from '../lyra-api-client'
import { getBrandProfile } from './get-brand-profile'

describe('getBrandProfile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls the brand profile endpoint with workspace_id and returns it unchanged', async () => {
    vi.mocked(callLyraApi).mockResolvedValue({
      voiceSummary: 'Friendly, direct',
      toneAttributes: ['warm'],
      contentThemes: ['community'],
      guardrails: [{ type: 'NEVER_DISCUSS', value: 'pricing' }],
    })

    const result = await getBrandProfile({ workspace_id: 'ws-1' }, 'token-abc')

    expect(callLyraApi).toHaveBeenCalledWith('/api/brand-intelligence/profile', 'token-abc', { workspaceId: 'ws-1' })
    expect(result).toEqual({
      voiceSummary: 'Friendly, direct',
      toneAttributes: ['warm'],
      contentThemes: ['community'],
      guardrails: [{ type: 'NEVER_DISCUSS', value: 'pricing' }],
    })
  })

  it('throws when workspace_id is missing', async () => {
    await expect(getBrandProfile({} as any, 'token-abc')).rejects.toThrow('workspace_id is required')
  })
})
