import { Worker, Queue } from 'bullmq'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { scrapeCompetitor } from '@/services/competitors/competitor-scraper'
import { extractThemes } from '@/services/competitors/theme-extractor'
import { redis } from '@/lib/redis'

export const competitorMonitorQueue = new Queue('competitor-monitoring', { connection: redis })

export const competitorMonitorWorker = new Worker(
  'competitor-monitoring',
  async (job) => {
    const { workspaceId } = job.data as { workspaceId: string }

    const whereClause: Prisma.WorkspaceWhereInput =
      workspaceId === 'all'
        ? { plan: { in: ['PRO', 'AGENCY'] } }
        : { id: workspaceId }

    const workspaces = await prisma.workspace.findMany({
      where: whereClause,
      select: { id: true },
    })

    for (const ws of workspaces) {
      const competitors = await prisma.competitor.findMany({
        where: { workspaceId: ws.id },
      })

      for (const competitor of competitors) {
        try {
          const data = await scrapeCompetitor({
            websiteUrl: competitor.websiteUrl,
            twitterHandle: competitor.twitterHandle,
            facebookPageId: competitor.facebookPageId,
          })

          const excerpts = data.recentPosts.map((p) => p.excerpt)
          const themes = await extractThemes(excerpts)

          await prisma.competitorSnapshot.create({
            data: {
              competitorId: competitor.id,
              postsPerWeek: data.postsPerWeek,
              recentTopics: themes,
              engagementBenchmark: data.engagementBenchmark,
              recentPosts: data.recentPosts,
            },
          })

          console.log(`Competitor snapshot saved: ${competitor.name} (${themes.join(', ')})`)
        } catch (err) {
          console.error(`Failed to scrape competitor ${competitor.id}:`, err)
        }
      }
    }
  },
  { connection: redis }
)

// Schedule daily run at 4am
competitorMonitorQueue.add(
  'daily-monitor',
  { workspaceId: 'all' },
  { repeat: { pattern: '0 4 * * *' } }
).catch((err) => console.error('[competitor-monitor] Failed to schedule daily job:', err))
