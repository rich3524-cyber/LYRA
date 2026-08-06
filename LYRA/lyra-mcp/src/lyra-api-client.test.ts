import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callLyraApi, postLyraApi, deleteLyraApi, LyraApiError, LyraApiTimeoutError, LyraApiNetworkError } from './lyra-api-client'

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

  it('normalizes a fetch timeout (AbortSignal.timeout rejection) into LyraApiTimeoutError', async () => {
    // fetch() rejects with a DOMException named 'TimeoutError' when the
    // AbortSignal.timeout() passed as `signal` fires. Simulate that directly
    // rather than waiting out a real 20s timeout.
    const timeoutError = new DOMException('The operation timed out.', 'TimeoutError')
    const fetchMock = vi.fn().mockRejectedValue(timeoutError)
    vi.stubGlobal('fetch', fetchMock)

    try {
      await callLyraApi('/api/workspaces', 'token-abc')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(LyraApiTimeoutError)
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(LyraApiError)
      expect((err as LyraApiTimeoutError).cause).toBe(timeoutError)
    }
  })

  it('normalizes a network failure (fetch TypeError rejection) into LyraApiNetworkError', async () => {
    const networkError = new TypeError('fetch failed')
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    vi.stubGlobal('fetch', fetchMock)

    try {
      await callLyraApi('/api/workspaces', 'token-abc')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(LyraApiNetworkError)
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(LyraApiTimeoutError)
      expect((err as LyraApiNetworkError).cause).toBe(networkError)
    }
  })

  it('normalizes a malformed response body (res.json() rejection) into LyraApiNetworkError', async () => {
    const parseError = new SyntaxError('Unexpected token in JSON')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw parseError
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      await callLyraApi('/api/workspaces', 'token-abc')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(LyraApiNetworkError)
      expect((err as LyraApiNetworkError).cause).toBe(parseError)
    }
  })

  it('calls AbortSignal.timeout with the configured timeout duration', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await callLyraApi('/api/workspaces', 'token-abc')

    expect(timeoutSpy).toHaveBeenCalledWith(20_000)
    timeoutSpy.mockRestore()
  })
})

describe('postLyraApi', () => {
  it('POSTs the body with the bearer token and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => ({ id: 'p1', status: 'SCHEDULED' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await postLyraApi('/api/posts', 'token-abc', { content: 'hi' })

    expect(result).toEqual({ id: 'p1', status: 'SCHEDULED' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lyraonline.ai/api/posts')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-abc', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ content: 'hi' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws LyraApiError on a non-ok response, same as callLyraApi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'bad' }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(postLyraApi('/api/posts', 'token-abc', {})).rejects.toMatchObject({ status: 422, body: { error: 'bad' } })
  })

  it('throws LyraApiTimeoutError on a real timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(postLyraApi('/api/posts', 'token-abc', {})).rejects.toThrow(LyraApiTimeoutError)
  })
})

describe('deleteLyraApi', () => {
  it('DELETEs with the bearer token and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteLyraApi('/api/competitors/comp-1', 'token-abc')

    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lyraonline.ai/api/competitors/comp-1')
    expect(init.method).toBe('DELETE')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-abc' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws LyraApiError on a non-ok response, same as callLyraApi/postLyraApi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not found' }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteLyraApi('/api/competitors/comp-1', 'token-abc')).rejects.toMatchObject({ status: 404, body: { error: 'not found' } })
  })

  it('throws LyraApiTimeoutError on a real timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteLyraApi('/api/competitors/comp-1', 'token-abc')).rejects.toThrow(LyraApiTimeoutError)
  })

  it('returns undefined on a 204 No Content response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 204, json: async () => { throw new SyntaxError('Unexpected end of JSON input') },
    }))
    await expect(deleteLyraApi('/api/posts/p1', 'token-abc')).resolves.toBeUndefined()
  })
})
