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
  const posts: CompetitorPost[] = []

  // Try common blog post selectors
  const selectors = [
    'article',
    '[class*="post"]',
    '[class*="blog"]',
    'main li',
  ]

  for (const selector of selectors) {
    $(selector).slice(0, 5).each((_, el) => {
      const title = $(el).find('h2, h3, h1').first().text().trim()
      const link = $(el).find('a').first().attr('href')
      const date = $(el).find('time').first().attr('datetime') ?? ''

      if (title.length > 10) {
        posts.push({
          date,
          excerpt: title.slice(0, 200),
          url: link ? new URL(link, websiteUrl).href : undefined,
          platform: 'website',
        })
      }
    })
    if (posts.length >= 5) break
  }

  // Fallback: extract headings from the main content area — works on any site structure
  // and gives Claude enough text to extract meaningful themes even without a blog section
  if (posts.length === 0) {
    const contentArea = $('main, [role="main"], #content, #main, .content, body').first()
    const seen = new Set<string>()
    contentArea.find('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim()
      if (text.length > 10 && text.length < 300 && !seen.has(text)) {
        seen.add(text)
        const rawHref = $(el).closest('a').attr('href') ?? $(el).find('a').first().attr('href')
        let url: string | undefined
        try { url = rawHref ? new URL(rawHref, websiteUrl).href : undefined } catch { /* ignore malformed */ }
        posts.push({ date: '', excerpt: text.slice(0, 200), url, platform: 'website' })
      }
    })
  }

  return posts.slice(0, 5)
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

  // Twitter + Facebook: skip silently if no API keys configured
  // (Phase 2 — not in scope for this version)

  // Estimate posts per week from dated posts only — null when frequency can't be determined
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
