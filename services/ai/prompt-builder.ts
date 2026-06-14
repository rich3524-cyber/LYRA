import { BrandProfile } from '@prisma/client'

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

  const platformList = platforms.join(', ')

  return `You are a social media copywriter. Write an engaging post for the following brand.

BRAND VOICE:
${voiceSummary}

TONE ATTRIBUTES: ${toneAttributes}

CONTENT THEMES: ${contentThemes}

TARGET AUDIENCE: ${audience}

POSTING GUIDELINES:
${postingGuidelines ?? 'None specified'}

PLATFORMS: ${platformList}
${topic ? `\nTOPIC / BRIEF: ${topic}` : ''}

Write a single social media caption optimised for the specified platform(s). Match the brand voice exactly. Include relevant hashtags if appropriate for the platform. Return only the caption text — no explanation, no alternatives, no markdown wrapper.`
}
