import { Worker, Queue } from 'bullmq'
import type { Prisma } from '@prisma/client'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { scrapeWebsite } from '@/services/brand-intelligence/scraper'
import { buildBrandProfile } from '@/services/brand-intelligence/profile-builder'
import { parseWorkspaceGuidelines } from '@/services/brand-intelligence/document-parser'
import { analyzeSocialPosts } from '@/services/brand-intelligence/social-analyzer'
import { analyzeEngagement } from '@/services/ai/engagement-analyzer'

export const brandSyncQueue = new Queue('brand-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts:         2,
    backoff:          { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail:     { count: 20 },
  },
})

export async function queueBrandSync(workspaceId: string) {
  await brandSyncQueue.add(
    'sync-brand',
    { workspaceId },
    { jobId: `brand-sync-${workspaceId}`, delay: 0 }
  )
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

    const workspace = await prisma.workspace.findUnique({
      where:   { id: workspaceId },
      include: { brandProfile: true },
    })
    if (!workspace) return

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
        postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights })),
        websiteData:     JSON.parse(JSON.stringify(websiteData)),
        lastScrapedAt:   new Date(),
        lastUpdatedAt:   new Date(),
      },
      update: {
        voiceSummary:    profileData.voiceSummary,
        toneAttributes:  profileData.toneAttributes,
        contentThemes:   profileData.contentThemes,
        audienceProfile: JSON.parse(JSON.stringify(profileData.audienceProfile)),
        postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights })),
        websiteData:     JSON.parse(JSON.stringify(websiteData)),
        lastScrapedAt:   new Date(),
        lastUpdatedAt:   new Date(),
      },
    })

    console.log(`brand-sync: completed for workspace ${workspaceId}`)
  },
  { connection: redis, concurrency: 3 }
)

worker.on('failed', (job, err) => {
  console.error(`brand-sync failed for workspace ${job?.data.workspaceId}:`, err)
})

export default worker
