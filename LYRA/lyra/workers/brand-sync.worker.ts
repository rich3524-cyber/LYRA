import { Worker } from 'bullmq'
import type { Prisma } from '@prisma/client'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { scrapeWebsite } from '@/services/brand-intelligence/scraper'
import { buildBrandProfile } from '@/services/brand-intelligence/profile-builder'
import { parseWorkspaceGuidelines } from '@/services/brand-intelligence/document-parser'
import { analyzeSocialPosts } from '@/services/brand-intelligence/social-analyzer'
import { analyzeEngagement } from '@/services/ai/engagement-analyzer'
import { brandSyncQueue } from '@/lib/queues'

export async function queueBrandSync(workspaceId: string) {
  await brandSyncQueue.add(
    'sync-brand',
    { workspaceId },
    { jobId: `brand-sync-${workspaceId}`, delay: 0 }
  )
}

// Exported (rather than left as an anonymous closure passed to `new Worker(...)`)
// so it's directly unit-testable -- see brand-sync.worker.test.ts.
export async function processBrandSyncJob(workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where:   { id: workspaceId },
    include: { brandProfile: true },
  })
  if (!workspace) return

  // Preserve any client-pasted guidelines already saved on the brand profile --
  // this weekly refresh never re-derives them (unlike the manual build route),
  // so without this the upsert below would silently wipe them on every run.
  const savedUserGuidelines = (workspace.brandProfile?.postingPatterns as Record<string, unknown> | null)?.userGuidelines as string | undefined

  let websiteData = { title: '', description: '', bodyText: '', headings: [] as string[], metaKeywords: [] as string[] }
  if (workspace.websiteUrl) {
    try {
      websiteData = await scrapeWebsite(workspace.websiteUrl)
    } catch {
      console.warn(`brand-sync: failed to scrape ${workspace.websiteUrl}`)
    }
  }

  const guidelinesText = workspace.brandProfile?.guidelineUrls?.length
    ? await parseWorkspaceGuidelines(workspace.brandProfile.guidelineUrls)
    : ''

  const socialPosts: string[] = []
  const insights = analyzeSocialPosts(socialPosts)

  const profileData = await buildBrandProfile(websiteData, guidelinesText, socialPosts)

  await prisma.brandProfile.upsert({
    where:  { workspaceId },
    create: {
      workspaceId,
      voiceSummary:    profileData.voiceSummary,
      toneAttributes:  profileData.toneAttributes,
      contentThemes:   profileData.contentThemes,
      audienceProfile: JSON.parse(JSON.stringify(profileData.audienceProfile)),
      postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights, userGuidelines: savedUserGuidelines || undefined })),
      websiteData:     JSON.parse(JSON.stringify(websiteData)),
      lastScrapedAt:   new Date(),
      lastUpdatedAt:   new Date(),
    },
    update: {
      voiceSummary:    profileData.voiceSummary,
      toneAttributes:  profileData.toneAttributes,
      contentThemes:   profileData.contentThemes,
      audienceProfile: JSON.parse(JSON.stringify(profileData.audienceProfile)),
      postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights, userGuidelines: savedUserGuidelines || undefined })),
      websiteData:     JSON.parse(JSON.stringify(websiteData)),
      lastScrapedAt:   new Date(),
      lastUpdatedAt:   new Date(),
    },
  })

  console.log(`brand-sync: completed for workspace ${workspaceId}`)
}

const worker = new Worker(
  'brand-sync',
  async (job) => {
    const { workspaceId } = job.data as { workspaceId: string }

    if (job.name === 'analyze-engagement') {
      const profile = await prisma.brandProfile.findUnique({
        where:  { workspaceId },
        select: { postingPatterns: true },
      })
      if (!profile) return
      const result = await analyzeEngagement(workspaceId)
      if (result !== null) {
        const existing = (profile.postingPatterns as Record<string, unknown>) ?? {}
        await prisma.brandProfile.update({
          where: { workspaceId },
          data:  { postingPatterns: { ...existing, ...result } as Prisma.InputJsonValue },
        })
      }
      return
    }

    await processBrandSyncJob(workspaceId)
  },
  { connection: redis, concurrency: 3 }
)

worker.on('failed', (job, err) => {
  console.error(`brand-sync failed for workspace ${job?.data.workspaceId}:`, err)
})

worker.on('error', (err) => {
  console.error('brand-sync worker error:', err)
})

export default worker
