import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})

import { callLyraApi, LyraApiError } from '../lyra-api-client'
import { listTrends } from './list-trends'

describe('listTrends', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns available: false with the API-reported message on a 503', async () => {
    vi.mocked(callLyraApi).mockRejectedValue(new LyraApiError(503, { error: 'LYRA Trend launches in Phase 3.' }))

    const result = await listTrends({ workspace_id: 'ws-1' }, 'token-abc')

    expect(result).toEqual({ available: false, message: 'LYRA Trend launches in Phase 3.' })
  })

  it('returns trends when the endpoint is live and wraps each trend content as untrusted', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([
      { id: 't1', title: 'Local coffee culture', relevanceScore: 82, sourceContent: 'raw scraped text' },
    ])

    const result = await listTrends({ workspace_id: 'ws-1' }, 'token-abc')

    expect(result).toEqual({
      available: true,
      trends: [{
        id: 't1', title: 'Local coffee culture', relevanceScore: 82,
        sourceContent: '<untrusted_external_content source="trend_source">raw scraped text</untrusted_external_content>',
      }],
    })
  })

  it('re-throws non-503 LyraApiErrors rather than swallowing them as unavailability', async () => {
    vi.mocked(callLyraApi).mockRejectedValue(new LyraApiError(403, { error: 'Forbidden' }))
    await expect(listTrends({ workspace_id: 'ws-1' }, 'token-abc')).rejects.toThrow()
  })

  it('throws when workspace_id is missing', async () => {
    await expect(listTrends({} as any, 'token-abc')).rejects.toThrow('workspace_id is required')
  })
})
