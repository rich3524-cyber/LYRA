import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import type { ScrapedWebsite } from './scraper'
import type { BrandProfileData } from './profile-builder'

const VALID_CATEGORIES = ['legal', 'safety', 'discrimination', 'media', 'business_specific']

export interface CrisisKeywordSuggestion {
  keyword:  string
  category: 'legal' | 'safety' | 'discrimination' | 'media' | 'business_specific'
}

export interface CrisisKeywordSuggestionState {
  keyword:   string
  category:  string
  dismissed: boolean
}

/**
 * Merges freshly-generated suggestions into the existing list. A new
 * suggestion is skipped (not appended, not un-dismissed) if its keyword
 * already exists in `existing` -- dismissed or not -- or already matches an
 * active guardrail. If `newSuggestions` itself contains keywords that match
 * case-insensitively, only the first occurrence is kept. Existing entries
 * are never modified.
 */
export function mergeCrisisKeywordSuggestions(
  existing: CrisisKeywordSuggestionState[],
  newSuggestions: CrisisKeywordSuggestion[],
  activeGuardrailKeywords: string[]
): CrisisKeywordSuggestionState[] {
  const seen = new Set([
    ...existing.map((s) => s.keyword.toLowerCase()),
    ...activeGuardrailKeywords.map((k) => k.toLowerCase()),
  ])

  const additions: CrisisKeywordSuggestionState[] = []
  for (const s of newSuggestions) {
    const key = s.keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    additions.push({ keyword: s.keyword, category: s.category, dismissed: false })
  }

  return [...existing, ...additions]
}

export async function suggestCrisisKeywords(
  websiteData: ScrapedWebsite,
  contentThemes: string[],
  audienceProfile: BrandProfileData['audienceProfile']
): Promise<CrisisKeywordSuggestion[]> {
  const prompt = `You are a crisis-management analyst for a social media monitoring tool. Suggest keywords that, if they appear in an incoming comment, should immediately escalate it to a human rather than let AI auto-reply to it.

BUSINESS CONTEXT:
Title: ${websiteData.title.slice(0, 200)}
Description: ${websiteData.description.slice(0, 500)}
Content themes: ${contentThemes.join(', ') || 'Not provided'}
Audience: ${audienceProfile?.demographics ?? 'Not provided'}

Always include coverage for these baseline categories, phrased as realistic words or short phrases a commenter might actually type (not formal/legal terminology):
- legal: threats of legal action (e.g. "lawsuit", "suing", "my lawyer")
- safety: safety or health incidents (e.g. "injured", "allergic reaction", "hospitalized")
- discrimination: discrimination or harassment claims (e.g. "discriminated", "racist", "harassment")
- media: press or media attention (e.g. "journalist", "reporter", "going to the news")

Then add 2-4 keywords specific to this business's industry and offering that a generic list would miss, categorized as "business_specific" -- e.g. "food poisoning" for a restaurant, "data breach" for a software company.

Produce a JSON array of 5-10 objects, each: {"keyword": "...", "category": "legal|safety|discrimination|media|business_specific"}. Keywords should be short (1-3 words) and lowercase.

Return ONLY valid JSON. No markdown, no explanation.`

  const response = await anthropic.messages.create({
    model:      CLAUDE_MODEL,
    max_tokens: 800,
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  return (parsed as unknown[]).filter(
    (item): item is CrisisKeywordSuggestion =>
      typeof (item as Record<string, unknown>)?.keyword === 'string' &&
      VALID_CATEGORIES.includes((item as Record<string, unknown>)?.category as string)
  )
}
