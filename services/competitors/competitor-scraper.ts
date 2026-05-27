import * as cheerio from 'cheerio'

// SSRF protection — block private/loopback ranges
function isPrivateAddress(hostname: string): boolean {
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
  ]
  return privatePatterns.some((p) => p.test(hostname))
}

export type CompetitorPost = {
  date: string
  excerpt: string
  url?: string
  platform: string
}

export type CompetitorData = {
  recentPosts: CompetitorPost[]
  postsPerWeek: number
  engagementBenchmark: number | null
}

export async function scrapeCompetitorWebsite(websiteUrl: string): Promise<CompetitorPost[]> {
  let parsed: URL
  try {
    parsed = new URL(websiteUrl)
  } catch {
    return []
  }

  if (isPrivateAddress(parsed.hostname)) {
    console.warn(`SSRF block: ${parsed.hostname}`)
    return []
  }

  let html: string
  try {
    const res = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LYRABot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    html = await res.text()
  } catch {
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

  // Estimate posts per week from dates found (fallback: assume once/week if no dates)
  const datedPosts = allPosts.filter((p) => p.date)
  let postsPerWeek = 1
  if (datedPosts.length >= 2) {
    const dates = datedPosts.map((p) => new Date(p.date).getTime()).filter((d) => !isNaN(d)).sort()
    if (dates.length >= 2) {
      const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)
      postsPerWeek = spanDays > 0 ? (dates.length / spanDays) * 7 : 1
    }
  }

  return {
    recentPosts: allPosts,
    postsPerWeek: Math.round(postsPerWeek * 10) / 10,
    engagementBenchmark: null,
  }
}
