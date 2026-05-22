import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import { ScrapedWebsite } from './scraper'

export interface BrandProfileData {
  voiceSummary:   string
  toneAttributes: string[]
  contentThemes:  string[]
  audienceProfile: {
    demographics: string
    interests:    string[]
    painPoints:   string[]
    language:     string
  }
  postingGuidelines: string
}

export async function buildBrandProfile(
  websiteData: ScrapedWebsite,
  guidelinesText: string,
  socialPosts: string[]
): Promise<BrandProfileData> {
  const prompt = `You are a brand intelligence analyst. Analyse the following data about a brand and produce a structured brand profile.

WEBSITE DATA:
Title: ${websiteData.title}
Description: ${websiteData.description}
Key headings: ${websiteData.headings.slice(0, 20).join(' | ')}
Body content excerpt: ${websiteData.bodyText.slice(0, 3000)}

BRAND GUIDELINES:
${guidelinesText.slice(0, 2000) || 'Not provided'}

RECENT SOCIAL POSTS (${socialPosts.length} posts):
${socialPosts.slice(0, 20).join('\n---\n') || 'Not provided'}

Produce a JSON object with exactly these fields:
{
  "voiceSummary": "2-3 sentence description of the brand's voice and tone",
  "toneAttributes": ["array", "of", "5-8", "adjectives"],
  "contentThemes": ["array", "of", "5-8", "main", "content", "topics"],
  "audienceProfile": {
    "demographics": "description of target audience",
    "interests": ["array", "of", "interests"],
    "painPoints": ["array", "of", "pain", "points"],
    "language": "formal|casual|technical|conversational"
  },
  "postingGuidelines": "Key rules for content creation based on brand guidelines"
}

Return ONLY valid JSON. No markdown, no explanation.`

  const response = await anthropic.messages.create({
    model:      CLAUDE_MODEL,
    max_tokens: 1000,
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text) as BrandProfileData
}
