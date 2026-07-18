import * as dns from 'dns/promises'
import * as net from 'net'

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
]

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
}

function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) return true // block IPv6 except explicit allowlist
  const n = ipToInt(ip)
  return BLOCKED_CIDRS.some(([lo, hi]) => n >= lo && n <= hi)
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'https:') throw new Error('Only https URLs are permitted')
  const addresses = await dns.resolve4(parsed.hostname).catch(() => [] as string[])
  if (addresses.length === 0) throw new Error(`Cannot resolve hostname: ${parsed.hostname}`)
  for (const addr of addresses) {
    if (isPrivateIp(addr)) throw new Error(`URL resolves to a private/reserved address: ${addr}`)
  }
  return parsed
}

/**
 * Fetches a user-supplied URL with SSRF protection: https-only, DNS-resolved
 * against a private/reserved-range blocklist, and each redirect hop
 * re-validated before being followed (redirect: 'manual' -- fetch does not
 * re-validate a Location header against our blocklist on its own, so a safe
 * URL that 302s to an internal address would otherwise bypass the check).
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let currentUrl = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = await assertSafeUrl(currentUrl)
    const res = await fetch(parsed, { ...init, redirect: 'manual' })
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
