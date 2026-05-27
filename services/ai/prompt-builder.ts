import { BrandProfile } from '@prisma/client'

const PLATFORM_LENGTH: Record<string, string> = {
  INSTAGRAM:        '150–300 characters',
  LINKEDIN:         '600–1200 characters',
  TWITTER:          'under 280 characters',
  FACEBOOK:         '80–500 characters',
  TIKTOK:           '100–150 characters',
  GOOGLE_BUSINESS:  '300–500 characters',
}

export function buildCaptionPrompt(
  brandProfile: BrandProfile,
  platforms: string[],
  topic?: string
): string {
  const postingGuidelines =
    (brandProfile.postingPatterns as Record<string, unknown> | null)?.guidelines as string | undefined

  const voiceSummary    = brandProfile.voiceSummary    ?? 'Not specified'
  const toneAttributes  = (brandProfile.toneAttributes as string[] | null)?.join(', ') ?? 'Not specified'
  const contentThemes   = (brandProfile.contentThemes  as string[] | null)?.join(', ') ?? 'Not specified'
  const audienceProfile = brandProfile.audienceProfile as Record<string, unknown> | null
  const audience = audienceProfile
    ? `Demographics: ${audienceProfile.demographics ?? 'Unknown'}. Language style: ${audienceProfile.language ?? 'conversational'}.`
    : 'Not specified'

  const primaryPlatform = platforms[0] ?? 'INSTAGRAM'
  const lengthTarget = PLATFORM_LENGTH[primaryPlatform] ?? '100–500 characters'
  const platformList = platforms.join(', ')

  return `You are a social media copywriter. Write a high-scoring post for the following brand.

BRAND VOICE:
${voiceSummary}

TONE ATTRIBUTES: ${toneAttributes}

CONTENT THEMES: ${contentThemes}

TARGET AUDIENCE: ${audience}

POSTING GUIDELINES:
${postingGuidelines ?? 'None specified'}

PLATFORMS: ${platformList}
${topic ? `\nTOPIC / BRIEF: ${topic}` : ''}

QUALITY REQUIREMENTS — optimise for all six dimensions:
1. HOOK: Open with a line that compels reading. The first 10 words decide whether someone stops scrolling.
2. CLARITY: One clear message. No jargon, no ambiguity. A 12-year-old should instantly understand the point.
3. CTA: End with a specific call to action. Tell the reader exactly what to do next.
4. LENGTH: Target ${lengthTarget} for ${primaryPlatform}. Respect the platform's attention span.
5. HASHTAGS: Include 3–5 relevant, specific hashtags (${primaryPlatform === 'LINKEDIN' || primaryPlatform === 'TWITTER' ? '1–3 for this platform' : '3–5 for this platform'}). No over-tagging.
6. EMOTIONAL RESONANCE: Evoke a feeling — curiosity, urgency, empathy, or inspiration. Facts inform; emotion compels.

Return only the caption text — no explanation, no alternatives, no markdown wrapper.`
}
