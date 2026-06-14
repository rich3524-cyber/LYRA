import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import type { BrandProfile } from '@prisma/client'
import type { PageAnalysis } from './on-page-analyzer'

export interface GeneratedSeoContent {
  metaTitle: string
  metaDescription: string
  h1: string
  intro: string
}

export async function generateSeoContent(
  analysis: Pick<PageAnalysis, 'url' | 'title' | 'metaDescription' | 'h1'>,
  brandProfile: Pick<BrandProfile, 'voiceSummary' | 'toneAttributes' | 'contentThemes'> | null
): Promise<GeneratedSeoContent> {
  const brandContext = brandProfile
    ? [
        `Brand voice: ${brandProfile.voiceSummary ?? 'Professional and clear.'}`,
        `Tone: ${brandProfile.toneAttributes.join(', ')}`,
        `Themes: ${brandProfile.contentThemes.join(', ')}`,
      ].join('\n')
    : 'No brand profile — write in a professional, direct tone.'

  const prompt = `You are an expert SEO copywriter. Generate optimised SEO content for this web page.

URL: ${analysis.url}
Current title tag: ${analysis.title ?? 'None'}
Current meta description: ${analysis.metaDescription ?? 'None'}
Current H1: ${analysis.h1 ?? 'None'}

${brandContext}

Rules:
- metaTitle: 50–60 characters. Include the primary keyword implied by the URL. No trailing brand suffix unless it fits.
- metaDescription: 120–160 characters. Compelling, ends with implicit call to action, matches page intent.
- h1: Different from metaTitle. Keyword-rich. Speaks directly to the visitor's goal.
- intro: First 2 sentences of page body copy. Active voice. Under 50 words. Establishes value immediately.

Return ONLY valid JSON — no markdown, no commentary:
{
  "metaTitle": "...",
  "metaDescription": "...",
  "h1": "...",
  "intro": "..."
}`

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  return JSON.parse(text) as GeneratedSeoContent
}
