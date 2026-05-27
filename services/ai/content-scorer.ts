import { anthropic } from '@/lib/anthropic'

export type DimensionScore = {
  score: number
  suggestion: string | null
}

export type ScoringResult = {
  overallScore: number
  dimensions: {
    hook: DimensionScore
    clarity: DimensionScore
    cta: DimensionScore
    length: DimensionScore
    hashtags: DimensionScore
    emotionalResonance: DimensionScore
  }
}

const PLATFORM_LENGTH_GUIDE: Record<string, string> = {
  INSTAGRAM: '150–300 chars ideal',
  LINKEDIN: '600–1200 chars ideal',
  TWITTER: 'under 280 chars',
  FACEBOOK: '80–500 chars',
  TIKTOK: '100–150 chars',
  GOOGLE_BUSINESS: '300–500 chars',
}

export async function scoreContent(content: string, platform: string): Promise<ScoringResult> {
  const lengthGuide = PLATFORM_LENGTH_GUIDE[platform] ?? '100–500 chars'

  const prompt = `You are a social media content coach. Score this ${platform} post on 6 dimensions from 1–10.
For any dimension scoring below 7, provide ONE specific, actionable suggestion (1–2 sentences max).
For dimensions scoring 7 or above, set suggestion to null.

Platform length guidance: ${lengthGuide}
Current post length: ${content.length} characters

Return ONLY valid JSON matching this exact shape:
{
  "overallScore": <number 1-10, 1 decimal>,
  "dimensions": {
    "hook": { "score": <1-10>, "suggestion": <string or null> },
    "clarity": { "score": <1-10>, "suggestion": <string or null> },
    "cta": { "score": <1-10>, "suggestion": <string or null> },
    "length": { "score": <1-10>, "suggestion": <string or null> },
    "hashtags": { "score": <1-10>, "suggestion": <string or null> },
    "emotionalResonance": { "score": <1-10>, "suggestion": <string or null> }
  }
}

Scoring guide:
- hook: Does the opening line compel reading? First 10 words matter most.
- clarity: Is the message immediately understandable? No jargon, no ambiguity.
- cta: Is there a clear call to action? What should the reader do next?
- length: Is length appropriate for ${platform}? (${lengthGuide})
- hashtags: Relevant, correctly placed, not over-used? 0 hashtags can be fine on some platforms.
- emotionalResonance: Does it evoke a feeling or connection? Story, empathy, urgency, humour?

Post to score:
"""
${content}
"""
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed: ScoringResult = JSON.parse(text)

  if (!parsed.dimensions?.hook || typeof parsed.overallScore !== 'number') {
    throw new Error('Invalid scoring response shape')
  }

  return parsed
}
