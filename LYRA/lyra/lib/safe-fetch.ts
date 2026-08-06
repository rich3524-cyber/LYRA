import * as dns from 'dns/promises'
import * as net from 'net'
import { Agent, fetch as undiciFetch } from 'undici'

// RFC 1918 + loopback + link-local + CGNAT ranges blocked to prevent SSRF.
// Extracted from services/brand-intelligence/scraper.ts (the one scraper that
// already did this correctly) so every fetch of a user-supplied URL in the
// codebase shares one implementation instead of three divergent copies.
const BLOCKED_CIDRS: [number, number][] = [
  [ipToInt('10.0.0.0'),    ipToInt('10.255.255.255')],
  [ipToInt('172.16.0.0'),  ipToInt('172.31.255.255')],
  [ipToInt('192.168.0.0'), ipToInt('192.168.255.255')],
  [ipToInt('127.0.0.0'),   ipToInt('127.255.255.255')],
  [ipToInt('169.254.0.0'), ipToInt('169.254.255.255')], // cloud metadata (AWS/GCP/Azure) lives here
  [ipToInt('100.64.0.0'),  ipToInt('100.127.255.255')],
  [ipToInt('0.0.0.0'),     ipToInt('0.255.255.255')],
  [ipToInt('192.0.0.0'),   ipToInt('192.0.0.255')],     // IETF protocol assignments; 192.0.0.192 is Oracle Cloud's metadata endpoint
  [ipToInt('198.18.0.0'),  ipToInt('198.19.255.255')],  // RFC 2544 benchmarking
  [ipToInt('224.0.0.0'),   ipToInt('239.255.255.255')], // multicast
  [ipToInt('240.0.0.0'),   ipToInt('255.255.255.255')], // reserved + broadcast (255.255.255.255)
]

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
}

/**
 * Parses an IPv6 address (including an embedded IPv4 tail like
 * "::ffff:169.254.169.254") into its 8 16-bit groups. Returns null if the
 * address can't be parsed, so callers can fail closed.
 */
function parseIPv6Groups(ipRaw: string): number[] | null {
  let ip = ipRaw.split('%')[0] // strip a zone id (e.g. "fe80::1%eth0") if present

  // An IPv6 address can end in a dotted-decimal IPv4 tail (RFC 4291 section
  // 2.2), e.g. "::ffff:169.254.169.254". Convert that tail into two hex
  // groups so the rest of this function only ever deals with hex groups.
  const ipv4TailMatch = ip.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (ipv4TailMatch) {
    const quad = ipv4TailMatch[1].split('.').map(Number)
    if (quad.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
    const hex1 = ((quad[0] << 8) | quad[1]).toString(16)
    const hex2 = ((quad[2] << 8) | quad[3]).toString(16)
    ip = ip.slice(0, ip.length - ipv4TailMatch[1].length) + hex1 + ':' + hex2
  }

  if ((ip.match(/::/g) || []).length > 1) return null

  let head: string[]
  let tail: string[]
  if (ip.includes('::')) {
    const [h, t] = ip.split('::')
    head = h ? h.split(':') : []
    tail = t ? t.split(':') : []
  } else {
    head = ip.split(':')
    tail = []
  }

  const missing = 8 - (head.length + tail.length)
  if (missing < 0) return null
  const groups = [...head, ...Array(missing).fill('0'), ...tail]
  if (groups.length !== 8) return null

  const nums = groups.map((g) => parseInt(g === '' ? '0' : g, 16))
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null
  return nums
}

function isPrivateIpv6(ip: string): boolean {
  const groups = parseIPv6Groups(ip)
  if (!groups) return true // unparseable -- fail closed

  // :: (unspecified) and ::1 (loopback)
  if (groups.slice(0, 7).every((g) => g === 0) && (groups[7] === 0 || groups[7] === 1)) return true
  // fe80::/10 -- link-local. First 10 bits fixed => first group in [0xfe80, 0xfebf].
  if (groups[0] >= 0xfe80 && groups[0] <= 0xfebf) return true
  // fc00::/7 -- unique-local. First 7 bits fixed => first group in [0xfc00, 0xfdff].
  if (groups[0] >= 0xfc00 && groups[0] <= 0xfdff) return true
  // fec0::/10 -- deprecated site-local (RFC 3879). First 10 bits fixed => first group in [0xfec0, 0xfeff].
  if (groups[0] >= 0xfec0 && groups[0] <= 0xfeff) return true
  // ff00::/8 -- multicast. First 8 bits fixed => first group in [0xff00, 0xffff].
  if (groups[0] >= 0xff00 && groups[0] <= 0xffff) return true
  // 2002::/16 -- 6to4. Tunnels arbitrary embedded IPv4 traffic (including
  // private/metadata addresses) through a well-known prefix.
  if (groups[0] === 0x2002) return true
  // 64:ff9b::/96 -- NAT64 well-known prefix (RFC 6052). The last 32 bits are
  // an embedded IPv4 address reachable through a NAT64 gateway, e.g.
  // 64:ff9b::a9fe:a9fe embeds 169.254.169.254.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
    return true
  }
  // ::/96 -- deprecated IPv4-compatible IPv6 (RFC 4291). Still parseable by
  // some resolvers/stacks; the last 32 bits are an embedded IPv4 address.
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
    return true
  }
  // ::ffff:0:0/96 -- IPv4-mapped. Extract the embedded IPv4 and check it
  // against the same blocklist as a native IPv4 address, since
  // ::ffff:169.254.169.254 is exactly as dangerous as 169.254.169.254.
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
    const a = (groups[6] >> 8) & 0xff
    const b = groups[6] & 0xff
    const c = (groups[7] >> 8) & 0xff
    const d = groups[7] & 0xff
    return isPrivateIp(`${a}.${b}.${c}.${d}`)
  }
  return false
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipToInt(ip)
    return BLOCKED_CIDRS.some(([lo, hi]) => n >= lo && n <= hi)
  }
  if (net.isIPv6(ip)) return isPrivateIpv6(ip)
  return true // unrecognized format -- fail closed
}

export interface ValidatedAddress {
  address: string
  family: 4 | 6
}

interface ValidatedTarget {
  url: URL
  addresses: ValidatedAddress[]
}

/**
 * Resolves both A and AAAA records for the hostname and validates every
 * returned address against the private/reserved-range blocklists. Rejects if
 * either record type resolves to something private -- a public A record does
 * not excuse a private AAAA record (or vice versa), since the actual
 * connection could go out over either address family.
 *
 * Returns the validated addresses alongside the parsed URL so callers (i.e.
 * safeFetch) can pin the real network connection to one of these exact,
 * already-checked addresses instead of triggering a second, independent DNS
 * resolution -- which is what closes the DNS-rebinding TOCTOU gap.
 */
async function resolveAndValidate(rawUrl: string): Promise<ValidatedTarget> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'https:') throw new Error('Only https URLs are permitted')

  // If the hostname is itself an IP literal (e.g. "169.254.169.254" or the
  // bracketed IPv6 form "[::1]"), validate that literal address directly
  // against the same blocklists used for resolved addresses. This must not
  // rely on dns.resolve4/resolve6 throwing ENOTFOUND for an already-numeric
  // hostname -- that's an incidental side effect of Node's resolver, not a
  // guarantee, and a future "handle IP-literal URLs" shortcut built on
  // net.isIP() without this explicit check would silently reopen the SSRF
  // hole this file exists to close.
  const bracketed = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
  const literalCandidate = bracketed ? parsed.hostname.slice(1, -1) : parsed.hostname
  const literalFamily = net.isIP(literalCandidate)
  if (literalFamily !== 0) {
    if (isPrivateIp(literalCandidate)) {
      throw new Error(`URL hostname is a private/reserved IP-literal address: ${literalCandidate}`)
    }
    return { url: parsed, addresses: [{ address: literalCandidate, family: literalFamily as 4 | 6 }] }
  }

  const [v4, v6] = await Promise.all([
    dns.resolve4(parsed.hostname).catch(() => [] as string[]),
    dns.resolve6(parsed.hostname).catch(() => [] as string[]),
  ])

  const addresses: ValidatedAddress[] = [
    ...v4.map((address) => ({ address, family: 4 as const })),
    ...v6.map((address) => ({ address, family: 6 as const })),
  ]

  if (addresses.length === 0) throw new Error(`Cannot resolve hostname: ${parsed.hostname}`)

  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new Error(`URL resolves to a private/reserved address: ${address}`)
  }

  return { url: parsed, addresses }
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const { url } = await resolveAndValidate(rawUrl)
  return url
}

/**
 * Builds an undici Agent whose `connect.lookup` hands back the exact,
 * already-validated address instead of performing a fresh DNS lookup. This
 * is what pins the real TCP connection to the address that was checked by
 * resolveAndValidate: the hostname is still used for the Host header and
 * TLS SNI/certificate validation (fetch is still called with the original
 * URL), but the socket itself connects straight to `address`, so an
 * attacker who controls DNS for their URL's domain can't return a safe
 * address for validation and a different (private/metadata) address for the
 * connection undici would otherwise re-resolve internally.
 */
export function createPinnedDispatcher({ address, family }: ValidatedAddress): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        // dns.lookup's callback has two shapes depending on options.all:
        // (err, address, family) or (err, [{address, family}]). undici (via
        // Node's net/tls connect) may invoke either, so support both.
        const opts = typeof options === 'function' ? {} : options
        const cb = typeof options === 'function' ? (options as unknown as typeof callback) : callback
        if (opts && (opts as { all?: boolean }).all) {
          cb(null, [{ address, family }])
        } else {
          cb(null, address, family)
        }
      },
    },
  })
}

/**
 * Fetches a user-supplied URL with SSRF protection: https-only, DNS-resolved
 * (both A and AAAA) against a private/reserved-range blocklist, the real
 * connection pinned to the exact validated address (no separate re-resolution
 * inside fetch()), and each redirect hop re-validated and re-pinned before
 * being followed (redirect: 'manual' -- fetch does not re-validate a Location
 * header against our blocklist on its own, so a safe URL that 302s to an
 * internal address would otherwise bypass the check).
 *
 * Uses undici's own `fetch` (the same package instance that supplies
 * `Agent`/`createPinnedDispatcher`) rather than Node's global `fetch`.
 * Node's global fetch is powered by a separately vendored, Node-version-pinned
 * copy of undici bundled into Node core -- a *different* copy than the
 * `undici` package installed in node_modules, and the two are not guaranteed
 * to agree on the Dispatcher/Handler protocol a custom `dispatcher: Agent`
 * must implement. Confirmed empirically on this project's actual pinned
 * `undici` version: passing an `Agent` built from the npm package as
 * `dispatcher` to Node's global fetch throws `InvalidArgumentError: invalid
 * onRequestStart method` (UND_ERR_INVALID_ARG) -- the two copies disagree on
 * the handler shape. Using undici's own fetch keeps the dispatcher and the
 * fetch call on the same internal protocol version always, regardless of
 * which Node version (or which future undici bump) this runs under.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let currentUrl = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url: parsed, addresses } = await resolveAndValidate(currentUrl)
    const dispatcher = createPinnedDispatcher(addresses[0])
    const fetchInit: RequestInit & { dispatcher?: Agent } = { ...init, redirect: 'manual', dispatcher }
    // undici ships its own RequestInit/Response types, structurally close to
    // but not identical to the DOM lib's (e.g. newer TS lib helpers add
    // disposable-iterator members to global Headers that undici's own types
    // don't declare). The runtime objects are fully duck-type compatible --
    // status, headers.get/entries, json/text/arrayBuffer, and a real
    // ReadableStream body -- callers of safeFetch never rely on `instanceof
    // Response`. Cast at this one boundary rather than typing safeFetch's
    // public signature around undici's types, which would leak an
    // implementation detail into every one of safeFetch's 8 callers.
    const res = (await undiciFetch(parsed, fetchInit as Parameters<typeof undiciFetch>[1])) as unknown as Response
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      currentUrl = new URL(location, parsed).toString()
      continue
    }
    return res
  }
  throw new Error(`Too many redirects fetching ${rawUrl}`)
}
