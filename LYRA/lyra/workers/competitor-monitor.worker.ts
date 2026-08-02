import { Worker, Queue } from 'bullmq'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { scrapeCompetitor } from '@/services/competitors/competitor-scraper'
import { extractThemes } from '@/services/competitors/theme-extractor'
import { redis } from '@/lib/redis'

export const competitorMonitorQueue = new Queue('competitor-monitoring', {
  connection: redis,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 50 },
  },
})

async function scrapeOneCompetitor(competitorId: string) {
  const competitor = await prisma.competitor.findUnique({ where: { id: competitorId } })
  if (!competitor) return

  const data = await scrapeCompetitor({
    websiteUrl:     competitor.websiteUrl,
    twitterHandle:  competitor.twitterHandle,
    facebookPageId: competitor.facebookPageId,
  })

  const excerpts = data.recentPosts.map((p) => p.excerpt)
  const themes = await extractThemes(excerpts)

  await prisma.competitorSnapshot.create({
    data: {
      competitorId:        competitor.id,
      postsPerWeek:        data.postsPerWeek,
      recentTopics:        themes,
      engagementBenchmark: data.engagementBenchmark,
      recentPosts:         data.recentPosts,
    },
  })

  console.log(`Competitor snapshot saved: ${competitor.name} (${themes.join(', ')})`)
}

export const competitorMonitorWorker = new Worker(
  'competitor-monitoring',
  async (job) => {
    if (job.name === 'scrape-competitor') {
      const { competitorId } = job.data as { competitorId: string }
      await scrapeOneCompetitor(competitorId)
      return
    }

    // 'daily-monitor' fans out into one job per competitor instead of scraping
    // every tenant's every competitor sequentially inside a single job body. The
    // old shape meant BullMQ concurrency/worker replicas gave zero speedup --
    // there was only ever one job in flight, so nothing else could run in
    // parallel with it. Each competitor is now its own job with its own
    // retry/backoff, isolated from every other competitor's failures.
    const { workspaceId } = job.data as { workspaceId: string }
    const whereClause: Prisma.WorkspaceWhereInput =
      workspaceId === 'all'
        ? { plan: { in: ['PRO', 'AGENCY'] } }
        : { id: workspaceId }

    const competitors = await prisma.competitor.findMany({
      where:  { workspace: whereClause },
      select: { id: true },
    })
    if (competitors.length === 0) return

    // Stable per-day jobId -- a re-triggered daily-monitor run on the same day
    // (e.g. a manual retry) dedupes against already-enqueued/in-flight scrapes
    // instead of double-scraping every competitor.
    const today = new Date().toISOString().slice(0, 10)
    await competitorMonitorQueue.addBulk(
      competitors.map((c) => ({
        name: 'scrape-competitor',
        data: { competitorId: c.id },
        opts: { jobId: `scrape-${c.id}-${today}` },
      }))
    )
  },
  { connection: redis, concurrency: 10 }
)

competitorMonitorWorker.on('failed', (job, err) => {
  console.error(`Competitor monitor job ${job?.id} (${job?.name}) failed:`, err)
})

competitorMonitorWorker.on('error', (err) => {
  console.error('Competitor monitor worker error:', err)
})

// Schedule daily run at 4am
competitorMonitorQueue.add(
  'daily-monitor',
  { workspaceId: 'all' },
  { repeat: { pattern: '0 4 * * *' } }
).catch((err) => console.error('[competitor-monitor] Failed to schedule daily job:', err))
