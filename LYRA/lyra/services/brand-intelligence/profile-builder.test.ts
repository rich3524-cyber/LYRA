import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/anthropic', async () => {
  const actual = await vi.importActual<typeof import('@/lib/anthropic')>('@/lib/anthropic')
  return { ...actual, anthropic: { messages: { create: vi.fn() } } }
})

import { anthropic } from '@/lib/anthropic'
import { buildBrandProfile } from './profile-builder'

describe('buildBrandProfile', () => {
  it('returns audienceProfile.languageLevel from the Claude response', async () => {
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          voiceSummary: 'Friendly and direct.',
          toneAttributes: ['friendly', 'direct'],
          contentThemes: ['product updates', 'customer stories'],
          audienceProfile: {
            demographics: 'Small business owners',
            interests: ['efficiency'],
            painPoints: ['too many tools'],
            languageLevel: 'casual',
          },
          postingGuidelines: 'Keep it short.',
        }),
      }],
    } as never)

    const websiteData = { title: '', description: '', bodyText: '', headings: [], metaKeywords: [] }
    const result = await buildBrandProfile(websiteData, '', [])

    expect(result.audienceProfile.languageLevel).toBe('casual')
  })
})
