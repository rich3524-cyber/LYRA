import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('dns/promises', () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}))

vi.mock('undici', () => ({
  Agent: vi.fn(),
  fetch: vi.fn(),
}))

import { resolve4, resolve6 } from 'dns/promises'
import { Agent, fetch as undiciFetch } from 'undici'
import { assertSafeUrl, safeFetch } from './safe-fetch'

describe('assertSafeUrl', () => {
  beforeEach(() => {
    // Default: no AAAA record, matching the common case of an IPv4-only host.
    vi.mocked(resolve6).mockResolvedValue([])
  })

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

  it('rejects a URL that only has an IPv6 loopback address (::1)', async () => {
    vi.mocked(resolve4).mockResolvedValue([])
    vi.mocked(resolve6).mockResolvedValue(['::1'])
    await expect(assertSafeUrl('https://v6-loopback.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('rejects a URL that resolves (via AAAA) to an IPv6 link-local address (fe80::/10)', async () => {
    vi.mocked(resolve4).mockResolvedValue([])
    vi.mocked(resolve6).mockResolvedValue(['fe80::1'])
    await expect(assertSafeUrl('https://v6-link-local.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('rejects a URL that resolves (via AAAA) to an IPv6 unique-local address (fc00::/7)', async () => {
    vi.mocked(resolve4).mockResolvedValue([])
    vi.mocked(resolve6).mockResolvedValue(['fd12:3456:789a::1'])
    await expect(assertSafeUrl('https://v6-unique-local.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('rejects a URL whose AAAA record is an IPv4-mapped IPv6 address embedding a private IPv4 (::ffff:169.254.169.254)', async () => {
    vi.mocked(resolve4).mockResolvedValue([])
    vi.mocked(resolve6).mockResolvedValue(['::ffff:169.254.169.254'])
    await expect(assertSafeUrl('https://v6-mapped-metadata.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('rejects a URL with a safe public A record but a private AAAA record (dual-stack bypass)', async () => {
    // A public IPv4 address alone must not be enough to pass -- if the AAAA
    // record resolves to something private, the whole URL must be rejected,
    // since the actual connection could go out over either family.
    vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
    vi.mocked(resolve6).mockResolvedValue(['::1'])
    await expect(assertSafeUrl('https://dual-stack.example.com')).rejects.toThrow(/private\/reserved address/)
  })

  it('accepts a URL whose only address is a public IPv6 address', async () => {
    vi.mocked(resolve4).mockResolvedValue([])
    vi.mocked(resolve6).mockResolvedValue(['2606:2800:220:1:248:1893:25c8:1946'])
    const parsed = await assertSafeUrl('https://v6-public.example.com')
    expect(parsed.hostname).toBe('v6-public.example.com')
  })

  describe('additional defense-in-depth ranges', () => {
    it('rejects a URL resolving to the Oracle Cloud metadata endpoint (192.0.0.192, within 192.0.0.0/24)', async () => {
      vi.mocked(resolve4).mockResolvedValue(['192.0.0.192'])
      await expect(assertSafeUrl('https://oracle-metadata.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL resolving into the 198.18.0.0/15 benchmarking range', async () => {
      vi.mocked(resolve4).mockResolvedValue(['198.18.0.1'])
      await expect(assertSafeUrl('https://benchmark.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL resolving to a multicast address (224.0.0.0/4)', async () => {
      vi.mocked(resolve4).mockResolvedValue(['224.0.0.1'])
      await expect(assertSafeUrl('https://multicast.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL resolving into the reserved 240.0.0.0/4 range', async () => {
      vi.mocked(resolve4).mockResolvedValue(['240.0.0.1'])
      await expect(assertSafeUrl('https://reserved.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL resolving to the broadcast address (255.255.255.255)', async () => {
      vi.mocked(resolve4).mockResolvedValue(['255.255.255.255'])
      await expect(assertSafeUrl('https://broadcast.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL whose AAAA record is a NAT64 address embedding the cloud metadata IP (64:ff9b::a9fe:a9fe)', async () => {
      vi.mocked(resolve4).mockResolvedValue([])
      vi.mocked(resolve6).mockResolvedValue(['64:ff9b::a9fe:a9fe'])
      await expect(assertSafeUrl('https://nat64-metadata.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL whose AAAA record is a deprecated IPv4-compatible IPv6 address (::1.2.3.4, within ::/96)', async () => {
      vi.mocked(resolve4).mockResolvedValue([])
      vi.mocked(resolve6).mockResolvedValue(['::1.2.3.4'])
      await expect(assertSafeUrl('https://v4-compat.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL whose AAAA record is a 6to4 address (2002::/16)', async () => {
      vi.mocked(resolve4).mockResolvedValue([])
      vi.mocked(resolve6).mockResolvedValue(['2002:c000:0204::1'])
      await expect(assertSafeUrl('https://sixtofour.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL whose AAAA record is a deprecated site-local address (fec0::/10)', async () => {
      vi.mocked(resolve4).mockResolvedValue([])
      vi.mocked(resolve6).mockResolvedValue(['fec0::1'])
      await expect(assertSafeUrl('https://site-local.example.com')).rejects.toThrow(/private\/reserved address/)
    })

    it('rejects a URL whose AAAA record is an IPv6 multicast address (ff00::/8)', async () => {
      vi.mocked(resolve4).mockResolvedValue([])
      vi.mocked(resolve6).mockResolvedValue(['ff02::1'])
      await expect(assertSafeUrl('https://v6-multicast.example.com')).rejects.toThrow(/private\/reserved address/)
    })
  })

  describe('IP-literal hostnames', () => {
    it('rejects a private IP-literal URL (https://169.254.169.254/) explicitly, with a message that names the reason', async () => {
      // This must NOT depend on dns.resolve4/resolve6 throwing ENOTFOUND for
      // an already-numeric hostname -- mock them to return something that
      // would otherwise look "safe" and confirm the literal-address check
      // still catches it independently, on its own, before any DNS call.
      vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
      vi.mocked(resolve6).mockResolvedValue([])
      const resolve4CallsBefore = vi.mocked(resolve4).mock.calls.length
      const resolve6CallsBefore = vi.mocked(resolve6).mock.calls.length

      await expect(assertSafeUrl('https://169.254.169.254/')).rejects.toThrow(/IP-literal/)

      expect(vi.mocked(resolve4).mock.calls.length).toBe(resolve4CallsBefore)
      expect(vi.mocked(resolve6).mock.calls.length).toBe(resolve6CallsBefore)
    })

    it('rejects a private IPv6 IP-literal URL (https://[::1]/) explicitly, without invoking DNS', async () => {
      vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
      vi.mocked(resolve6).mockResolvedValue([])
      const resolve4CallsBefore = vi.mocked(resolve4).mock.calls.length
      const resolve6CallsBefore = vi.mocked(resolve6).mock.calls.length

      await expect(assertSafeUrl('https://[::1]/')).rejects.toThrow(/IP-literal/)

      expect(vi.mocked(resolve4).mock.calls.length).toBe(resolve4CallsBefore)
      expect(vi.mocked(resolve6).mock.calls.length).toBe(resolve6CallsBefore)
    })

    it('accepts a public IPv4 IP-literal URL without invoking DNS', async () => {
      const resolve4CallsBefore = vi.mocked(resolve4).mock.calls.length
      const resolve6CallsBefore = vi.mocked(resolve6).mock.calls.length

      const parsed = await assertSafeUrl('https://93.184.216.34/path')

      expect(parsed.hostname).toBe('93.184.216.34')
      expect(vi.mocked(resolve4).mock.calls.length).toBe(resolve4CallsBefore)
      expect(vi.mocked(resolve6).mock.calls.length).toBe(resolve6CallsBefore)
    })
  })
})

describe('safeFetch', () => {
  beforeEach(() => {
    vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
    vi.mocked(resolve6).mockResolvedValue([])
    // Agent is a real undici class in production; here it just needs to hand
    // back an object that records the options it was constructed with, so
    // tests can inspect the connect.lookup function that was configured.
    // vi.restoreAllMocks() (below) only affects vi.spyOn() spies, not plain
    // vi.fn() mocks like this one -- clear call history explicitly so each
    // test starts from zero.
    vi.mocked(Agent).mockClear()
    vi.mocked(Agent).mockImplementation(function (this: unknown, opts: unknown) {
      return { __opts: opts } as unknown as InstanceType<typeof Agent>
    } as unknown as typeof Agent)
    // undici's fetch is mocked per-test below; reset here so a previous
    // test's mockResolvedValue/mockResolvedValueOnce queue and call history
    // never leaks into the next test.
    vi.mocked(undiciFetch).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the response for a normal public https URL', async () => {
    const fetchMock = vi.mocked(undiciFetch)
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }) as never)

    const res = await safeFetch('https://example.com/data')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a redirect that points at a private address instead of blindly following it', async () => {
    // First hop: dns resolves the public host safely and the response is a
    // redirect to a private address. safeFetch must re-validate the Location
    // header (dns.resolve4 rejecting private on the second call) rather than
    // just following fetch's own redirect handling.
    vi.mocked(resolve4)
      .mockResolvedValueOnce(['93.184.216.34']) // public.example.com -- safe
      .mockResolvedValueOnce(['169.254.169.254']) // redirect target -- private, must be blocked

    vi.mocked(undiciFetch).mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://internal.example.com/secret' } }) as never
    )

    await expect(safeFetch('https://public.example.com/redirect')).rejects.toThrow(/private\/reserved address/)
  })

  it('pins the actual connection to the exact address that was DNS-validated instead of leaving fetch to re-resolve the hostname (closes the DNS-rebinding TOCTOU gap)', async () => {
    // Simulates an attacker who controls DNS for their domain: the address
    // used for the safety check must be the literal address the socket
    // connects to, not a second, independent resolution performed by fetch()
    // itself (which the attacker could answer differently).
    vi.mocked(resolve4).mockResolvedValue(['203.0.113.9'])
    vi.mocked(resolve6).mockResolvedValue([])

    const fetchMock = vi.mocked(undiciFetch)
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }) as never)

    await safeFetch('https://rebind.example.com/data')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, fetchInit] = fetchMock.mock.calls[0] as [unknown, { dispatcher?: unknown }]
    expect(fetchInit.dispatcher).toBeDefined()

    // The dispatcher must be an Agent configured with a connect.lookup that
    // hands back the pre-validated address directly, rather than performing
    // a fresh DNS lookup of its own.
    const agentCall = vi.mocked(Agent).mock.calls.at(-1)
    expect(agentCall).toBeDefined()
    const agentOptions = agentCall![0] as { connect?: { lookup?: (...args: never[]) => void } }
    expect(agentOptions.connect?.lookup).toBeInstanceOf(Function)

    const resolve4CallsBeforeLookup = vi.mocked(resolve4).mock.calls.length
    const resolve6CallsBeforeLookup = vi.mocked(resolve6).mock.calls.length

    const lookupResult = await new Promise((resolve, reject) => {
      ;(agentOptions.connect!.lookup as unknown as (
        hostname: string,
        options: { all?: boolean },
        callback: (err: Error | null, addresses: unknown) => void
      ) => void)('rebind.example.com', { all: true }, (err, addresses) => {
        if (err) reject(err)
        else resolve(addresses)
      })
    })

    // No additional DNS resolution happened when the connector "connected" --
    // the address handed to the callback came from the validation step, not
    // a fresh lookup that an attacker's DNS server could answer differently.
    expect(vi.mocked(resolve4).mock.calls.length).toBe(resolve4CallsBeforeLookup)
    expect(vi.mocked(resolve6).mock.calls.length).toBe(resolve6CallsBeforeLookup)
    expect(lookupResult).toEqual([{ address: '203.0.113.9', family: 4 }])
  })

  it('re-validates and re-pins the connection on each redirect hop, not just the first', async () => {
    vi.mocked(resolve4)
      .mockResolvedValueOnce(['203.0.113.9']) // first hop -- safe
      .mockResolvedValueOnce(['203.0.113.50']) // redirect target -- also safe, different address
    vi.mocked(resolve6).mockResolvedValue([])

    const fetchMock = vi.mocked(undiciFetch)
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://hop2.example.com/final' } }) as never)
      .mockResolvedValueOnce(new Response('ok', { status: 200 }) as never)

    const res = await safeFetch('https://hop1.example.com/start')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Each hop must construct its own pinned dispatcher for that hop's
    // validated address -- the second hop must not still be pinned to the
    // first hop's address.
    expect(vi.mocked(Agent).mock.calls.length).toBe(2)
    const secondHopOptions = vi.mocked(Agent).mock.calls[1][0] as { connect?: { lookup?: (...args: never[]) => void } }
    const secondHopAddress = await new Promise((resolve, reject) => {
      ;(secondHopOptions.connect!.lookup as unknown as (
        hostname: string,
        options: { all?: boolean },
        callback: (err: Error | null, addresses: unknown) => void
      ) => void)('hop2.example.com', { all: true }, (err, addresses) => {
        if (err) reject(err)
        else resolve(addresses)
      })
    })
    expect(secondHopAddress).toEqual([{ address: '203.0.113.50', family: 4 }])
  })

  it('strips Authorization/API-key headers on a cross-origin redirect hop, but keeps them on a same-origin hop', async () => {
    vi.mocked(resolve4)
      .mockResolvedValueOnce(['203.0.113.9'])  // first hop
      .mockResolvedValueOnce(['203.0.113.50']) // cross-origin redirect target
    vi.mocked(resolve6).mockResolvedValue([])

    const fetchMock = vi.mocked(undiciFetch)
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://attacker.example.com/steal' } }) as never)
      .mockResolvedValueOnce(new Response('ok', { status: 200 }) as never)

    await safeFetch('https://trusted.example.com/start', {
      headers: { Authorization: 'Bearer real-api-key', 'X-Api-Key': 'real-key', 'X-Other': 'keep-me' },
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondHopInit = fetchMock.mock.calls[1][1] as { headers?: Headers }
    const secondHopHeaders = new Headers(secondHopInit.headers)
    expect(secondHopHeaders.get('authorization')).toBeNull()
    expect(secondHopHeaders.get('x-api-key')).toBeNull()
    expect(secondHopHeaders.get('x-other')).toBe('keep-me')
  })

  it('keeps credential headers when a redirect stays on the same origin', async () => {
    vi.mocked(resolve4).mockResolvedValue(['203.0.113.9'])
    vi.mocked(resolve6).mockResolvedValue([])

    const fetchMock = vi.mocked(undiciFetch)
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://trusted.example.com/next' } }) as never)
      .mockResolvedValueOnce(new Response('ok', { status: 200 }) as never)

    await safeFetch('https://trusted.example.com/start', {
      headers: { Authorization: 'Bearer real-api-key' },
    })

    const secondHopInit = fetchMock.mock.calls[1][1] as { headers?: Headers }
    const secondHopHeaders = new Headers(secondHopInit.headers)
    expect(secondHopHeaders.get('authorization')).toBe('Bearer real-api-key')
  })
})
