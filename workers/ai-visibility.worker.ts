import { Worker, Queue } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { queryPerplexity } from '@/services/ai-visibility/perplexity'

export const aiVisibilityQueue = new Queue('ai-visibility-monitoring', {
  connection: redis,
  defaultJobOptions: {
    attempts:         2,
    backoff:          { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 10 },
    removeOnFail:     { count: 10 },
  },
})

const worker = new Worker(
  'ai-visibility-monitoring',
  async () => {
    const queries = await prisma.aiVisibilityQuery.findMany({
      where:   { isActive: true },
      include: { workspace: { select: { id: true, name: true } } },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let processed = 0
    let skipped   = 0
    let failed    = 0

    for (const vq of queries) {
      // Skip if a snapshot already exists for this query today
      const existing = await prisma.aiVisibilitySnapshot.findFirst({
        where: {
          queryId:  vq.id,
          provider: 'PERPLEXITY',
          takenAt:  { gte: today },
        },
        select: { id: true },
      })

      if (existing) {
        skipped++
        continue
      }

      try {
        const { content, citations } = await queryPerplexity(vq.query)

        const brandName  = vq.workspace.name.toLowerCase()
        const escaped    = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const matches    = content.toLowerCase().match(new RegExp(escaped, 'g'))
        const brandMentionCount = matches?.length ?? 0
        const brandMentioned    = brandMentionCount > 0

        await prisma.aiVisibilitySnapshot.create({
          data: {
            workspaceId:      vq.workspaceId,
            queryId:          vq.id,
            provider:         'PERPLEXITY',
            responseText:     content,
            brandMentioned,
            brandMentionCount,
            citedUrls:        citations,
          },
        })

        processed++
      } catch (err) {
        console.error(`[ai-visibility] query ${vq.id} failed:`, err)
        failed++
      }

      // 200ms between Perplexity calls to stay within rate limits
      await new Promise(r => setTimeout(r, 200))
    }

    console.log(`[ai-visibility] done — processed: ${processed}, skipped: ${skipped}, failed: ${failed}`)
  },
  { connection: redis, concurrency: 1 }
)

worker.on('failed', (_job, err) => {
  console.error('[ai-visibility] worker job failed:', err)
})

export { worker as aiVisibilityWorker }
export default worker
