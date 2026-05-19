import { anthropic } from '@/lib/anthropic'

export type GeneratedPost = {
  platform: string
  topic: string
  content: string
  scheduledAt: string
}

type BrandContext = {
  voiceSummary: string | null
  toneAttributes: string[]
  contentThemes: string[]
  audienceProfile: unknown
}

export async function generateWeekPosts(
  brand: BrandContext,
  weekNumber: number,
  weekStartDate: Date,
  platforms: Record<string, number>,
): Promise<GeneratedPost[]> {
  const platformList = Object.entries(platforms)
    .map(([platform, count]) => `${platform}: ${count} posts`)
    .join('\n')

  const themes = brand.contentThemes.length > 0 ? brand.contentThemes.join(', ') : 'General business content'
  const voice = brand.voiceSummary ?? 'Professional and engaging'
  const tone = brand.toneAttributes.length > 0 ? brand.toneAttributes.join(', ') : 'Professional'
  const weekStartStr = weekStartDate.toISOString().split('T')[0]

  const prompt = `You are a social media content strategist creating content for week ${weekNumber} of a scheduled campaign.

BRAND VOICE: ${voice}
TONE ATTRIBUTES: ${tone}
CONTENT THEMES: ${themes}
AUDIENCE: ${JSON.stringify(brand.audienceProfile ?? {})}

PLATFORMS AND POST COUNT THIS WEEK:
${platformList}

WEEK START DATE: ${weekStartStr}

Generate exactly the specified number of posts for each platform. Distribute posts across different days of the 7-day window starting ${weekStartStr}. Prefer different content themes for consecutive posts on the same platform.

Optimal posting times per platform:
- INSTAGRAM: 09:00, 12:00, 18:00
- LINKEDIN: 08:00, 12:00, 17:00
- FACEBOOK: 10:00, 15:00, 20:00
- TWITTER: 08:00, 12:00, 17:00, 20:00
- TIKTOK: 09:00, 15:00, 19:00
- GOOGLE_BUSINESS: 09:00, 14:00

Return ONLY a JSON array with no markdown fences, no explanation, and no trailing text. Use this exact shape:
[
  {
    "platform": "INSTAGRAM",
    "topic": "behind the scenes at our workshop",
    "content": "Full caption text with hashtags at the end. #hashtag1 #hashtag2",
    "scheduledAt": "2026-05-26T09:00:00.000Z"
  }
]

Rules:
- scheduledAt must be ISO 8601 UTC and fall within the 7 days starting ${weekStartStr}
- Each caption must match the brand voice and include 3–8 relevant hashtags
- No two consecutive posts on the same platform may share the same topic
- Do not repeat the exact same caption text for any two posts`

  let text = '[]'
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  } catch (err) {
    console.error('schedule-generator: Claude request failed', err instanceof Error ? err.message : err)
    return []
  }

  try {
    return JSON.parse(text) as GeneratedPost[]
  } catch {
    console.error('schedule-generator: failed to parse Claude response', text.slice(0, 500))
    return []
  }
}
