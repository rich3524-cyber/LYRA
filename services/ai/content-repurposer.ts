import * as cheerio from 'cheerio'
import { anthropic } from '@/lib/anthropic'

// SSRF protection
function isPrivateAddress(hostname: string): boolean {
  const privatePatterns = [
    /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^::1$/, /^0\.0\.0\.0$/,
  ]
  return privatePatterns.some((p) => p.test(hostname))
}

export async function extractArticleText(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }

  if (isPrivateAddress(parsed.hostname)) {
    throw new Error('URL not allowed')
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LYRABot/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()
  const $ = cheerio.load(html)

  // Remove nav, footer, ads
  $('nav, footer, script, style, aside, [class*="ad"], [id*="ad"]').remove()

  let text = ''
  const article = $('article').first()
  if (article.length) {
    text = article.text()
  } else {
    text = $('main p, .post p, .content p, article p, body p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 50)
      .join('\n\n')
  }

  // Collapse whitespace and truncate
  text = text.replace(/\s+/g, ' ').trim().slice(0, 8000)
  if (text.length < 100) throw new Error('Could not extract article content')
  return text
}

const PLATFORM_GUIDE: Record<string, string> = {
  INSTAGRAM: 'visual hook first, 150–300 chars, 3–5 relevant hashtags at end',
  LINKEDIN: 'professional tone, no hashtags, 600–1200 chars, one insight per paragraph',
  TWITTER: 'punchy, under 280 chars, 1–2 hashtags max, hook in first 8 words',
  FACEBOOK: 'conversational, 80–500 chars, no hashtags needed',
  TIKTOK: 'hook-first teaser under 150 chars, curiosity gap, call to watch',
  GOOGLE_BUSINESS: 'professional, local business tone, 300–500 chars, include a CTA',
}

export type RepurposedPost = { platform: string; content: string }

export async function* repurposeContent(
  sourceText: string,
  platforms: string[]
): AsyncGenerator<RepurposedPost> {
  const platformGuides = platforms
    .map((p) => `${p}: ${PLATFORM_GUIDE[p] ?? '100–500 chars, professional tone'}`)
    .join('\n')

  const prompt = `You are a social media copywriter. Repurpose the following article into platform-native posts.
Write one post for each platform listed. Each post must be optimised for its platform's format, tone, and length.

For each post, output it in this exact format (including the delimiter line):
---PLATFORM: <PLATFORM_NAME>---
<post content>

Platforms and guidelines:
${platformGuides}

Article to repurpose:
"""
${sourceText}
"""
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  })

  let buffer = ''

  for await (const chunk of response) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      buffer += chunk.delta.text

      // Parse complete platform blocks as they stream in
      const blockRegex = /---PLATFORM:\s*(\w+)---\n([\s\S]*?)(?=---PLATFORM:|$)/g
      let match: RegExpExecArray | null
      let lastIndex = 0

      while ((match = blockRegex.exec(buffer)) !== null) {
        const [fullMatch, platform, content] = match
        const trimmed = content.trim()
        if (trimmed.length > 0 && platforms.includes(platform)) {
          yield { platform, content: trimmed }
        }
        lastIndex = match.index + fullMatch.length
      }

      // Keep only unparsed tail
      if (lastIndex > 0) buffer = buffer.slice(lastIndex)
    }
  }

  // Flush remaining buffer
  if (buffer.trim().length > 0) {
    const finalMatch = /---PLATFORM:\s*(\w+)---\n([\s\S]+)/.exec(buffer)
    if (finalMatch) {
      const [, platform, content] = finalMatch
      const trimmed = content.trim()
      if (trimmed.length > 0 && platforms.includes(platform)) {
        yield { platform, content: trimmed }
      }
    }
  }
}
