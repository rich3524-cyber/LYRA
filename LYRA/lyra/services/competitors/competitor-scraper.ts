import * as cheerio from 'cheerio'
import { safeFetch } from '@/lib/safe-fetch'

export type CompetitorPost = {
  date: string
  excerpt: string
  url?: string
  platform: string
}

export type CompetitorData = {
  recentPosts: CompetitorPost[]
  postsPerWeek: number | null
  engagementBenchmark: number | null
}

function resolveUrl(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined
  try { return new URL(href, base).href } catch { return undefined }
}

// --- Source 1: JSON-LD structured data ---
// Most reliable — many sites include this for SEO. Looks for BlogPosting,
// Article, NewsArticle, or ItemList types in any <script type="application/ld+json">.
function extractFromJsonLd($: cheerio.CheerioAPI, baseUrl: string): CompetitorPost[] {
  const posts: CompetitorPost[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).text())
      const items: unknown[] = Array.isArray(raw) ? raw : [raw]
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const obj = item as Record<string, unknown>
        const type = obj['@type']
        const articleTypes = ['BlogPosting', 'Article', 'NewsArticle', 'TechArticle']
        if (typeof type === 'string' && articleTypes.includes(type)) {
          const headline = String(obj.headline ?? obj.name ?? '').trim().slice(0, 200)
          if (headline.length > 10) {
            posts.push({
              excerpt:  headline,
              url:      resolveUrl(String(obj.url ?? obj.mainEntityOfPage ?? ''), baseUrl),
              date:     String(obj.datePublished ?? ''),
              platform: 'website',
            })
          }
        }
        // ItemList — used by some news/blog aggregator pages
        if (type === 'ItemList' && Array.isArray(obj.itemListElement)) {
          for (const elem of obj.itemListElement as unknown[]) {
            if (!elem || typeof elem !== 'object') continue
            const e = elem as Record<string, unknown>
            const thing = (e.item && typeof e.item === 'object' ? e.item : e) as Record<string, unknown>
            const name = String(thing.name ?? '').trim().slice(0, 200)
            if (name.length > 10) {
              posts.push({
                excerpt:  name,
                url:      resolveUrl(String(thing.url ?? ''), baseUrl),
                date:     String(thing.datePublished ?? ''),
                platform: 'website',
              })
            }
          }
        }
      }
    } catch { /* malformed JSON-LD — skip */ }
  })
  return posts
}

// --- Source 2: RSS / Atom feed ---
// Look for a feed link in <head>, fetch it, parse with Cheerio in XML mode.
async function extractFromFeed($: cheerio.CheerioAPI, baseUrl: string): Promise<CompetitorPost[]> {
  const feedHref =
    $('link[rel="alternate"][type="application/rss+xml"]').attr('href') ??
    $('link[rel="alternate"][type="application/atom+xml"]').attr('href')
  if (!feedHref) return []

  const feedUrl = resolveUrl(feedHref, baseUrl)
  if (!feedUrl) return []

  let feedXml: string
  try {
    const res = await safeFetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LYRABot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    feedXml = await res.text()
  } catch {
    return []
  }

  const $f = cheerio.load(feedXml, { xmlMode: true })
  const posts: CompetitorPost[] = []

  $f('item, entry').slice(0, 5).each((_, el) => {
    const title   = $f(el).find('title').first().text().trim().slice(0, 200)
    const rawLink = $f(el).find('link').first().text().trim() || $f(el).find('link').attr('href')
    const rawDate = $f(el).find('pubDate, published, updated, dc\\:date').first().text().trim()
    if (title.length > 10) {
      posts.push({
        excerpt:  title,
        url:      resolveUrl(rawLink, baseUrl),
        date:     rawDate,
        platform: 'website',
      })
    }
  })
  return posts
}

// --- Source 3: CSS selectors ---
// Expanded set — tries in order, stops as soon as one yields ≥ 3 posts.
function extractFromSelectors($: cheerio.CheerioAPI, baseUrl: string): CompetitorPost[] {
  const selectors = [
    'article',
    '[class*="post-item"]',
    '[class*="blog-item"]',
    '[class*="news-item"]',
    '[class*="card"]',
    '[class*="entry"]',
    '[class*="post"]',
    '[class*="blog"]',
    '[class*="article"]',
    'main li',
    'section li',
  ]

  for (const selector of selectors) {
    const posts: CompetitorPost[] = []
    $(selector).slice(0, 5).each((_, el) => {
      const title = $(el).find('h1, h2, h3, h4').first().text().trim()
      const link  = $(el).find('a').first().attr('href')
      const date  = $(el).find('time').first().attr('datetime') ?? $(el).find('time').first().text().trim()
      if (title.length > 10) {
        posts.push({
          excerpt:  title.slice(0, 200),
          url:      resolveUrl(link, baseUrl),
          date,
          platform: 'website',
        })
      }
    })
    if (posts.length >= 3) return posts
  }
  return []
}

// --- Source 4: heading fallback ---
// Works on any site — pulls headings from the main content area. Last resort
// since it tends to include nav/hero headings, not just post titles.
function extractFromHeadings($: cheerio.CheerioAPI, baseUrl: string): CompetitorPost[] {
  const posts: CompetitorPost[] = []
  const seen = new Set<string>()
  $('main, [role="main"], #content, #main, .content, body').first().find('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim()
    if (text.length > 10 && text.length < 300 && !seen.has(text)) {
      seen.add(text)
      const rawHref = $(el).closest('a').attr('href') ?? $(el).find('a').first().attr('href')
      posts.push({ date: '', excerpt: text.slice(0, 200), url: resolveUrl(rawHref, baseUrl), platform: 'website' })
    }
  })
  return posts
}

export async function scrapeCompetitorWebsite(websiteUrl: string): Promise<CompetitorPost[]> {
  let html: string
  try {
    const res = await safeFetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LYRABot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    html = await res.text()
  } catch (err) {
    console.warn(`Competitor scrape blocked or failed for ${websiteUrl}:`, err instanceof Error ? err.message : err)
    return []
  }

  const $ = cheerio.load(html)

  // Try sources in order of reliability, stop as soon as one yields posts
  const fromJsonLd = extractFromJsonLd($, websiteUrl).filter(p => p.excerpt.length > 10)
  if (fromJsonLd.length > 0) return fromJsonLd.slice(0, 5)

  const fromFeed = await extractFromFeed($, websiteUrl)
  if (fromFeed.length > 0) return fromFeed.slice(0, 5)

  const fromSelectors = extractFromSelectors($, websiteUrl)
  if (fromSelectors.length > 0) return fromSelectors.slice(0, 5)

  return extractFromHeadings($, websiteUrl).slice(0, 5)
}

export async function scrapeCompetitor(competitor: {
  websiteUrl?: string | null
  twitterHandle?: string | null
  facebookPageId?: string | null
}): Promise<CompetitorData> {
  const allPosts: CompetitorPost[] = []

  if (competitor.websiteUrl) {
    const webPosts = await scrapeCompetitorWebsite(competitor.websiteUrl)
    allPosts.push(...webPosts)
  }

  // Twitter + Facebook: Phase 2 — not in scope for this version

  const datedPosts = allPosts.filter((p) => p.date)
  let postsPerWeek: number | null = null
  if (datedPosts.length >= 2) {
    const dates = datedPosts.map((p) => new Date(p.date).getTime()).filter((d) => !isNaN(d)).sort()
    if (dates.length >= 2) {
      const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)
      postsPerWeek = spanDays > 0 ? Math.round((dates.length / spanDays) * 7 * 10) / 10 : null
    }
  }

  return {
    recentPosts: allPosts,
    postsPerWeek,
    engagementBenchmark: null,
  }
}
