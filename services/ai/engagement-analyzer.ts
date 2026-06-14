import { prisma } from '@/lib/prisma'

export type PostingSlot = {
  dayOfWeek: number
  hour: number
  score: number
  sampleSize: number
}

export type PlatformPattern = {
  topSlots: PostingSlot[]
  byTopic: Record<string, PostingSlot[]>
  totalPostsAnalyzed: number
  analyzedAt: string
}

export type PostingPatterns = Record<string, PlatformPattern>

type SlotAcc = { rawScore: number; count: number }

function slotKey(dow: number, hour: number): string {
  return `${dow}:${hour}`
}

function parseSlotKey(key: string): { dayOfWeek: number; hour: number } {
  const [d, h] = key.split(':').map(Number)
  return { dayOfWeek: d, hour: h }
}

function normalizeSlots(slots: Record<string, SlotAcc>, topN: number): PostingSlot[] {
  const eligible = Object.entries(slots).filter(([, acc]) => acc.count >= 5)
  if (eligible.length === 0) return []
  const max = Math.max(...eligible.map(([, acc]) => acc.rawScore))
  const normalized: PostingSlot[] = eligible.map(([key, acc]) => ({
    ...parseSlotKey(key),
    score: max > 0 ? acc.rawScore / max : 0,
    sampleSize: acc.count,
  }))
  normalized.sort((a, b) => b.score - a.score)
  return normalized.slice(0, topN)
}

export async function analyzeEngagement(
  workspaceId: string
): Promise<PostingPatterns | null> {
  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      publishedAt: { not: null },
      metrics: {
        OR: [
          { likes: { gt: 0 } },
          { comments: { gt: 0 } },
          { shares: { gt: 0 } },
          { saves: { gt: 0 } },
          { clicks: { gt: 0 } },
        ],
      },
    },
    select: {
      publishedAt: true,
      topic: true,
      socialAccount: { select: { platform: true } },
      metrics: {
        select: { likes: true, comments: true, shares: true, saves: true, clicks: true },
      },
    },
  })

  if (posts.length === 0) return null

  const byPlatform: Record<string, typeof posts> = {}
  for (const post of posts) {
    const pl = post.socialAccount.platform
    if (!byPlatform[pl]) byPlatform[pl] = []
    byPlatform[pl].push(post)
  }

  const result: PostingPatterns = {}

  for (const [platform, pPosts] of Object.entries(byPlatform)) {
    if (pPosts.length < 20) continue

    const platformSlots: Record<string, SlotAcc> = {}
    const topicSlots: Record<string, Record<string, SlotAcc>> = {}

    for (const post of pPosts) {
      if (!post.publishedAt || !post.metrics) continue
      const dow = post.publishedAt.getUTCDay()
      const hour = post.publishedAt.getUTCHours()
      const key = slotKey(dow, hour)
      const score =
        post.metrics.likes * 1 +
        post.metrics.comments * 3 +
        post.metrics.shares * 2 +
        post.metrics.saves * 2 +
        post.metrics.clicks * 1

      if (!platformSlots[key]) platformSlots[key] = { rawScore: 0, count: 0 }
      platformSlots[key].rawScore += score
      platformSlots[key].count += 1

      if (post.topic) {
        if (!topicSlots[post.topic]) topicSlots[post.topic] = {}
        if (!topicSlots[post.topic][key]) topicSlots[post.topic][key] = { rawScore: 0, count: 0 }
        topicSlots[post.topic][key].rawScore += score
        topicSlots[post.topic][key].count += 1
      }
    }

    const topSlots = normalizeSlots(platformSlots, 5)
    if (topSlots.length === 0) continue

    const byTopic: Record<string, PostingSlot[]> = {}
    for (const [topic, tSlots] of Object.entries(topicSlots)) {
      const total = Object.values(tSlots).reduce((s, a) => s + a.count, 0)
      if (total < 10) continue
      const slots = normalizeSlots(tSlots, 3)
      if (slots.length > 0) byTopic[topic] = slots
    }

    result[platform] = {
      topSlots,
      byTopic,
      totalPostsAnalyzed: pPosts.length,
      analyzedAt: new Date().toISOString(),
    }
  }

  return Object.keys(result).length > 0 ? result : null
}
