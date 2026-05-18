import * as cheerio from 'cheerio'

export interface ScrapedWebsite {
  title:        string
  description:  string
  bodyText:     string
  headings:     string[]
  metaKeywords: string[]
}

export async function scrapeWebsite(url: string): Promise<ScrapedWebsite> {
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
