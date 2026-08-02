import { anthropic, CLAUDE_MODEL, extractClaudeText } from '@/lib/anthropic'
import type { PostingPatterns, PlatformPattern } from '@/services/ai/engagement-analyzer'

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

const DEFAULT_SLOTS: Record<string, string> = {
  INSTAGRAM:       '09:00, 12:00, 18:00',
  LINKEDIN:        '08:00, 12:00, 17:00',
  FACEBOOK:        '10:00, 15:00, 20:00',
  TWITTER:         '08:00, 12:00, 17:00, 20:00',
  TIKTOK:          '09:00, 15:00, 19:00',
  GOOGLE_BUSINESS: '09:00, 14:00',
}

function buildTimingBlock(platform: string, pattern?: PlatformPattern): string {
  if (!pattern) {
    return `Optimal posting times for ${platform}: ${DEFAULT_SLOTS[platform] ?? '09:00, 12:00, 18:00'}`
  }

  const lines: string[] = ["Optimal posting times (based on this workspace's engagement data):"]
  const slotStr = pattern.topSlots
    .slice(0, 3)
    .map(s => `${DAY_NAMES[s.dayOfWeek]} ${fmtHour(s.hour)} (score ${s.score.toFixed(2)})`)
    .join(', ')
  lines.push(`- Top slots: ${slotStr}`)
  for (const [topic, slots] of Object.entries(pattern.byTopic)) {
    const tStr = slots
      .map(s => `${DAY_NAMES[s.dayOfWeek]} ${fmtHour(s.hour)} (score ${s.score.toFixed(2)})`)
      .join(', ')
    lines.push(`- "${topic}": ${tStr}`)
  }
  lines.push('')
  lines.push('Instructions:')
  lines.push("- Prefer the highest-scoring slot that matches a post's topic if byTopic data exists")
  lines.push('- Fall back to the top slots if no topic match is available')
  lines.push('- Distribute posts to avoid scheduling two posts in the same slot')
  return lines.join('\n')
}

export async function generateWeekPosts(
  brand: BrandContext,
  weekNumber: number,
  weekStartDate: Date,
  platform: string,
  count: number,
  postingPatterns?: PostingPatterns,
): Promise<GeneratedPost[]> {
  const themes = brand.contentThemes.length > 0 ? brand.contentThemes.join(', ') : 'General business content'
  const voice = brand.voiceSummary ?? 'Professional and engaging'
  const tone = brand.toneAttributes.length > 0 ? brand.toneAttributes.join(', ') : 'Professional'
  const weekStartStr = weekStartDate.toISOString().split('T')[0]

  const prompt = `You are a social media content strategist creating content for week ${weekNumber} of a scheduled campaign.

BRAND VOICE: ${voice}
TONE ATTRIBUTES: ${tone}
CONTENT THEMES: ${themes}
AUDIENCE: ${JSON.stringify(brand.audienceProfile ?? {})}

PLATFORM: ${platform}
POST COUNT THIS WEEK: ${count}

WEEK START DATE: ${weekStartStr}

Generate exactly ${count} posts for ${platform}. Distribute posts across different days of the 7-day window starting ${weekStartStr}. Prefer different content themes for consecutive posts.

${buildTimingBlock(platform, postingPatterns?.[platform])}

Return ONLY a JSON array with no markdown fences, no explanation, and no trailing text. Use this exact shape:
[
  {
    "platform": "${platform}",
    "topic": "behind the scenes at our workshop",
    "content": "Full caption text with hashtags at the end. #hashtag1 #hashtag2",
    "scheduledAt": "2026-05-26T09:00:00.000Z"
  }
]

Rules:
- scheduledAt must be ISO 8601 UTC and fall within the 7 days starting ${weekStartStr}
- Each caption must match the brand voice and include 3–8 relevant hashtags
- No two consecutive posts may share the same topic
- Do not repeat the exact same caption text for any two posts`

  let text = '[]'
  try {
    // Netlify's synchronous function ceiling for this route is a hard 60s,
    // independent of any client-side timeout -- confirmed live (a killed
    // request logged at exactly 60000ms even after raising this client's own
    // timeout to 180s). Generating a full week across every platform in one
    // call routinely took ~55-60s and lost that race. Splitting into one call
    // per platform per week (see the API route and schedule-generator.tsx)
    // keeps each individual call small and fast regardless of how many
    // platforms/posts-per-week are selected -- this timeout just needs to be
    // comfortably above a single platform's generation time, not a safety net
    // for the platform ceiling itself.
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 45_000 })
    text = extractClaudeText(response) || '[]'
  } catch (err) {
    console.error('schedule-generator: Claude request failed', err instanceof Error ? err.message : err)
    return []
  }

  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let raw: unknown
  try {
    raw = JSON.parse(stripped)
  } catch {
    console.error('schedule-generator: failed to parse Claude response', text.slice(0, 500))
    throw new Error('Claude returned unparseable JSON')
  }
  if (!Array.isArray(raw)) {
    console.error('schedule-generator: expected array, got', typeof raw)
    throw new Error('Claude returned unexpected response shape')
  }
  const posts = raw.filter((p): p is GeneratedPost =>
    p !== null &&
    typeof p === 'object' &&
    typeof (p as GeneratedPost).platform === 'string' &&
    typeof (p as GeneratedPost).content === 'string' &&
    typeof (p as GeneratedPost).scheduledAt === 'string' &&
    !Number.isNaN(Date.parse((p as GeneratedPost).scheduledAt))
  )
  if (posts.length === 0) {
    console.error('schedule-generator: Claude returned an empty or fully invalid post array')
    throw new Error('No valid posts in Claude response')
  }
  return posts
}
