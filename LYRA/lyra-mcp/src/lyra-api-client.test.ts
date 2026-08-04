import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callLyraApi, LyraApiError } from './lyra-api-client'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.LYRA_API_BASE_URL = 'https://lyraonline.ai'
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.unstubAllGlobals()
})

describe('callLyraApi', () => {
  it('forwards the bearer token and calls the correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await callLyraApi('/api/workspaces', 'token-abc')

    expect(result).toEqual({ hello: 'world' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lyraonline.ai/api/workspaces')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-abc' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('appends query params when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await callLyraApi('/api/posts', 'token-abc', { workspaceId: 'ws-1', status: 'SCHEDULED' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lyraonline.ai/api/posts?workspaceId=ws-1&status=SCHEDULED')
  })

  it('throws LyraApiError with status and body on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(callLyraApi('/api/workspaces', 'token-abc')).rejects.toMatchObject({
      status: 403,
      body: { error: 'Forbidden' },
    })
  })

  it('LyraApiError is an instance of Error with a readable message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      await callLyraApi('/api/workspaces', 'bad-token')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(LyraApiError)
      expect(err).toBeInstanceOf(Error)
      expect((err as LyraApiError).message).toContain('401')
    }
  })
})
