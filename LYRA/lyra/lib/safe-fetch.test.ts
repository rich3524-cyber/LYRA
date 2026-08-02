import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('dns/promises', () => ({
  resolve4: vi.fn(),
}))

import { resolve4 } from 'dns/promises'
import { assertSafeUrl, safeFetch } from './safe-fetch'

describe('assertSafeUrl', () => {
  it('rejects http:// URLs (https-only policy)', async () => {
    await expect(assertSafeUrl('http://example.com')).rejects.toThrow('Only https URLs are permitted')
  })

  it('rejects a URL resolving to loopback (127.0.0.1)', async () => {
    vi.mocked(resolve4).mockResolvedValue(['127.0.0.1'])
    await expect(assertSafeUrl('https://loopback.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('rejects a URL resolving to the cloud metadata endpoint (169.254.169.254)', async () => {
    vi.mocked(resolve4).mockResolvedValue(['169.254.169.254'])
    await expect(assertSafeUrl('https://metadata.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('rejects a URL resolving to a private 10.x.x.x address', async () => {
    vi.mocked(resolve4).mockResolvedValue(['10.1.2.3'])
    await expect(assertSafeUrl('https://internal.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('accepts a normal public https URL', async () => {
    vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
    const parsed = await assertSafeUrl('https://example.com/path')
    expect(parsed.hostname).toBe('example.com')
  })
})

describe('safeFetch', () => {
  beforeEach(() => {
    vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the response for a normal public https URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await safeFetch('https://example.com/data')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('rejects a redirect that points at a private address instead of blindly following it', async () => {
    // First hop: dns resolves the public host safely and the response is a
    // redirect to a private address. safeFetch must re-validate the Location
    // header (dns.resolve4 rejecting private on the second call) rather than
    // just following fetch's own redirect handling.
    vi.mocked(resolve4)
      .mockResolvedValueOnce(['93.184.216.34']) // public.example.com -- safe
      .mockResolvedValueOnce(['169.254.169.254']) // redirect target -- private, must be blocked

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://internal.example.com/secret' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(safeFetch('https://public.example.com/redirect')).rejects.toThrow(/private\/reserved address/)

    vi.unstubAllGlobals()
  })
})
