import { describe, it, expect, vi, beforeEach } from 'vitest'

// brand-sync.worker.ts instantiates a real BullMQ Worker (which opens a
// Redis connection and starts polling) as a module-level side effect. Stub
// both out so importing the module under test doesn't try to talk to a real
// Redis instance -- processBrandSyncJob itself only touches the mocked
// modules below. Mirrors metrics-sync.worker.test.ts.
vi.mock('@/lib/redis', () => ({ redis: {} }))
vi.mock('bullmq', () => ({
  Worker: class {
    on() {}
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    brandProfile: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/services/brand-intelligence/scraper', () => ({
  scrapeWebsite: vi.fn(),
}))
vi.mock('@/services/brand-intelligence/profile-builder', () => ({
  buildBrandProfile: vi.fn(),
}))
vi.mock('@/services/brand-intelligence/document-parser', () => ({
  parseWorkspaceGuidelines: vi.fn(),
}))
vi.mock('@/services/brand-intelligence/social-analyzer', () => ({
  analyzeSocialPosts: vi.fn(),
}))
vi.mock('@/services/ai/engagement-analyzer', () => ({
  analyzeEngagement: vi.fn(),
}))
vi.mock('@/lib/queues', () => ({
  brandSyncQueue: { add: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { scrapeWebsite } from '@/services/brand-intelligence/scraper'
import { buildBrandProfile } from '@/services/brand-intelligence/profile-builder'
import { analyzeSocialPosts } from '@/services/brand-intelligence/social-analyzer'
import { processBrandSyncJob } from './brand-sync.worker'

const SOCIAL_INSIGHTS = { totalPosts: 0, avgPostLength: 0, topThemes: [], commonHashtags: [], toneIndicators: [] }

const PROFILE_DATA = {
  voiceSummary:    'Friendly and helpful',
  toneAttributes:  ['warm', 'professional'],
  contentThemes:   ['product tips'],
  audienceProfile: { demographics: 'SMB owners', interests: [], painPoints: [], languageLevel: 'plain' },
  postingGuidelines: 'Post 3x/week',
}

const WEBSITE_DATA = { title: 't', description: 'd', bodyText: 'b', headings: [], metaKeywords: [] }

function mockWorkspace(overrides: { brandProfile?: Record<string, unknown> | null; websiteUrl?: string | null } = {}) {
  return {
    id: 'ws-1',
    websiteUrl: overrides.websiteUrl === undefined ? null : overrides.websiteUrl,
    brandProfile: overrides.brandProfile === undefined ? null : overrides.brandProfile,
  }
}

describe('processBrandSyncJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(scrapeWebsite).mockResolvedValue(WEBSITE_DATA)
    vi.mocked(buildBrandProfile).mockResolvedValue(PROFILE_DATA)
    vi.mocked(analyzeSocialPosts).mockReturnValue(SOCIAL_INSIGHTS)
  })

  it('preserves an existing userGuidelines value on the UPDATE branch (no existing brandProfile.guidelineUrls, so this is an update to an existing profile)', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(
      mockWorkspace({
        brandProfile: {
          guidelineUrls: [],
          postingPatterns: { guidelines: 'old', socialInsights: {}, userGuidelines: 'Always mention our 24/7 support.' },
        },
      }) as never
    )

    await processBrandSyncJob('ws-1')

    expect(prisma.brandProfile.upsert).toHaveBeenCalledTimes(1)
    const call = vi.mocked(prisma.brandProfile.upsert).mock.calls[0][0] as {
      update: { postingPatterns: Record<string, unknown> }
      create: { postingPatterns: Record<string, unknown> }
    }
    // postingPatterns is passed as JSON.parse(JSON.stringify({...})) -- already
    // a plain object by the time it reaches the upsert call, not a JSON string.
    expect(call.update.postingPatterns.userGuidelines).toBe('Always mention our 24/7 support.')
    expect(call.create.postingPatterns.userGuidelines).toBe('Always mention our 24/7 support.')
  })

  it('preserves an existing userGuidelines value on the CREATE branch (no existing brandProfile row at all)', async () => {
    // No existing brandProfile row exists yet for this workspace, so the
    // upsert will hit the CREATE branch in Prisma -- but pasted guidelines
    // could still exist on a stale/partial row if brandProfile is present
    // with just postingPatterns.userGuidelines set. Exercise the case where
    // workspace.brandProfile itself carries the saved value.
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(
      mockWorkspace({
        brandProfile: {
          guidelineUrls: [],
          postingPatterns: { userGuidelines: 'Always mention our 24/7 support.' },
        },
      }) as never
    )

    await processBrandSyncJob('ws-1')

    const call = vi.mocked(prisma.brandProfile.upsert).mock.calls[0][0] as {
      create: { postingPatterns: Record<string, unknown> }
    }
    expect(call.create.postingPatterns.userGuidelines).toBe('Always mention our 24/7 support.')
  })

  it('does not force a userGuidelines key into the upsert when there is no saved value (no brandProfile at all)', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(mockWorkspace({ brandProfile: null }) as never)

    await processBrandSyncJob('ws-1')

    const call = vi.mocked(prisma.brandProfile.upsert).mock.calls[0][0] as {
      create: { postingPatterns: Record<string, unknown> }
      update: { postingPatterns: Record<string, unknown> }
    }
    expect(call.create.postingPatterns).not.toHaveProperty('userGuidelines')
    expect(call.update.postingPatterns).not.toHaveProperty('userGuidelines')
  })

  it('does not force a userGuidelines key into the upsert when the existing brandProfile has no userGuidelines set', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(
      mockWorkspace({
        brandProfile: { guidelineUrls: [], postingPatterns: { guidelines: 'old', socialInsights: {} } },
      }) as never
    )

    await processBrandSyncJob('ws-1')

    const call = vi.mocked(prisma.brandProfile.upsert).mock.calls[0][0] as {
      create: { postingPatterns: Record<string, unknown> }
      update: { postingPatterns: Record<string, unknown> }
    }
    expect(call.create.postingPatterns).not.toHaveProperty('userGuidelines')
    expect(call.update.postingPatterns).not.toHaveProperty('userGuidelines')
  })
})
