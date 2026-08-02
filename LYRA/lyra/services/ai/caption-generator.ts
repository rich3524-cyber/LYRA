import { BrandProfile } from '@prisma/client'
import { anthropic, CLAUDE_MODEL, extractClaudeText } from '@/lib/anthropic'
import { buildCaptionPrompt } from './prompt-builder'

export async function generateCaption(
  brandProfile: BrandProfile,
  platforms: string[],
  topic?: string
): Promise<string> {
  const prompt = buildCaptionPrompt(brandProfile, platforms, topic)

  const response = await anthropic.messages.create({
    model:      CLAUDE_MODEL,
    max_tokens: 1000,
    messages:   [{ role: 'user', content: prompt }],
  })

  return extractClaudeText(response)
}
