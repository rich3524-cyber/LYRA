import * as cheerio from 'cheerio'
import * as dns from 'dns/promises'
import * as net from 'net'

export interface ScrapedWebsite {
  title:        string
  description:  string
  bodyText:     string
  headings:     string[]
  metaKeywords: string[]
}

// RFC 1918 + loopback + link-local + CGNAT ranges blocked to prevent SSRF
const BLOCKED_CIDRS: [number, number][] = [
  [ipToInt('10.0.0.0'),      ipToInt('10.255.255.255')],
  [ipToInt('172.16.0.0'),    ipToInt('172.31.255.255')],
  [ipToInt('192.168.0.0'),   ipToInt('192.168.255.255')],
  [ipToInt('127.0.0.0'),     ipToInt('127.255.255.255')],
  [ipToInt('169.254.0.0'),   ipToInt('169.254.255.255')],
  [ipToInt('100.64.0.0'),    ipToInt('100.127.255.255')],
  [ipToInt('0.0.0.0'),       ipToInt('0.255.255.255')],
]

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
}

function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) return true // block IPv6 except explicit allowlist
  const n = ipToInt(ip)
  return BLOCKED_CIDRS.some(([lo, hi]) => n >= lo && n <= hi)
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
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

export async function scrapeWebsite(url: string): Promise<ScrapedWebsite> {
  await assertSafeUrl(url)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LyraBot/1.0 (brand intelligence crawler)' },
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()
  const $ = cheerio.load(html)

  // Remove non-content elements
  $('script, style, nav, footer, header, .cookie-banner').remove()

  const title        = $('title').text().trim()
  const description  = $('meta[name="description"]').attr('content') ?? ''
  const metaKeywords = ($('meta[name="keywords"]').attr('content') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  const headings = $('h1, h2, h3')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
  const bodyText = $('main, article, .content, body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000) // Limit for Claude context

  return { title, description, bodyText, headings, metaKeywords }
}

/**
 * Scrapes the homepage plus common subpages (/about, /services).
 * Individual page failures are silently skipped.
 * Body text from all pages is merged (capped at 8 000 chars total).
 */
export async function scrapeMultiplePages(baseUrl: string): Promise<ScrapedWebsite> {
  const origin = new URL(baseUrl).origin
  const pagesToTry = [
    baseUrl,
    `${origin}/about`,
    `${origin}/services`,
  ]

  const results = await Promise.allSettled(
    pagesToTry.map((url) => scrapeWebsite(url))
  )

  const successful = results
    .filter((r): r is PromiseFulfilledResult<ScrapedWebsite> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (successful.length === 0) {
    return { title: '', description: '', bodyText: '', headings: [], metaKeywords: [] }
  }

  return {
    title:        successful[0].title,
    description:  successful[0].description,
    bodyText:     successful.map((p) => p.bodyText).join('\n\n').slice(0, 8000),
    headings:     Array.from(new Set(successful.flatMap((p) => p.headings))).slice(0, 30),
    metaKeywords: Array.from(new Set(successful.flatMap((p) => p.metaKeywords))),
  }
}
