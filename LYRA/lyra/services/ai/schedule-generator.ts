import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'

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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtHour(h: number): string {
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
}

function buildTimingBlock(postingPatterns?: PostingPatterns): string {
  if (!postingPatterns || Object.keys(postingPatterns).length === 0) {
    return `Optimal posting times per platform:
- INSTAGRAM: 09:00, 12:00, 18:00
- LINKEDIN: 08:00, 12:00, 17:00
- FACEBOOK: 10:00, 15:00, 20:00
- TWITTER: 08:00, 12:00, 17:00, 20:00
- TIKTOK: 09:00, 15:00, 19:00
- GOOGLE_BUSINESS: 09:00, 14:00`
  }

  const lines: string[] = ["Optimal posting times (based on this workspace's engagement data):"]
  for (const [platform, pattern] of Object.entries(postingPatterns)) {
    const slotStr = pattern.topSlots
      .slice(0, 3)
      .map(s => `${DAY_NAMES[s.dayOfWeek]} ${fmtHour(s.hour)} (score ${s.score.toFixed(2)})`)
      .join(', ')
    lines.push(`- ${platform} top slots: ${slotStr}`)
    for (const [topic, slots] of Object.entries(pattern.byTopic)) {
      const tStr = slots
        .map(s => `${DAY_NAMES[s.dayOfWeek]} ${fmtHour(s.hour)} (score ${s.score.toFixed(2)})`)
        .join(', ')
      lines.push(`- ${platform} — "${topic}": ${tStr}`)
    }
  }
  lines.push('')
  lines.push('Instructions:')
  lines.push("- For each post, prefer the highest-scoring slot that matches the post's topic if byTopic data exists")
  lines.push('- Fall back to the platform top slots if no topic match is available')
  lines.push('- Distribute posts to avoid scheduling two posts in the same slot on the same platform')
  return lines.join('\n')
}

export async function generateWeekPosts(
  brand: BrandContext,
  weekNumber: number,
  weekStartDate: Date,
  platforms: Record<string, number>,
  postingPatterns?: PostingPatterns,
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

${buildTimingBlock(postingPatterns)}

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
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })
    text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  } catch (err) {
    console.error('schedule-generator: Claude request failed', err instanceof Error ? err.message : err)
    return []
  }

  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const raw = JSON.parse(stripped)
    if (!Array.isArray(raw)) {
      console.error('schedule-generator: expected array, got', typeof raw)
      return []
    }
    return raw.filter((p): p is GeneratedPost =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as GeneratedPost).platform === 'string' &&
      typeof (p as GeneratedPost).content === 'string' &&
      typeof (p as GeneratedPost).scheduledAt === 'string' &&
      !Number.isNaN(Date.parse((p as GeneratedPost).scheduledAt))
    )
  } catch {
    console.error('schedule-generator: failed to parse Claude response', text.slice(0, 500))
    return []
  }
}
