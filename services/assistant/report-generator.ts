import { prisma } from '@/lib/prisma'
import { anthropic } from '@/lib/anthropic'
import type { ReportData, ReportMetrics, PlatformPerformance } from './report-types'

export function getQuarterLabel(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1
  return `Q${quarter}-${date.getFullYear()}`
}

export function getPeriodBounds(daysBack: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - daysBack)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export function calculateEngagementRate(metrics: {
  likes: number
  comments: number
  shares: number
  saves: number
  impressions: number
}): number {
  if (metrics.impressions === 0) return 0
  return (metrics.likes + metrics.comments + metrics.shares + metrics.saves) / metrics.impressions
}

export async function countQualifyingPosts(
  workspaceId: string,
  from: string,
  to: string
): Promise<number> {
  return prisma.post.count({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      publishedAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
  })
}

export async function calculateMetrics(
  workspaceId: string,
  from: string,
  to: string
): Promise<ReportMetrics> {
  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      publishedAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
    include: {
      metrics: true,
      socialAccount: { select: { platform: true } },
    },
  })

  if (posts.length === 0) {
    return { totalPosts: 0, avgEngagementRate: 0, bestPlatform: null, topContentTheme: null, byPlatform: [] }
  }

  const byPlatformMap = new Map<string, { postCount: number; totalEngagement: number; topPostId: string | null; topEngagement: number }>()

  let globalTotalEngagement = 0

  for (const post of posts) {
    const platform = post.socialAccount.platform
    if (!byPlatformMap.has(platform)) {
      byPlatformMap.set(platform, { postCount: 0, totalEngagement: 0, topPostId: null, topEngagement: -1 })
    }
    const entry = byPlatformMap.get(platform)!
    entry.postCount++

    if (post.metrics) {
      const rate = calculateEngagementRate({
        likes: post.metrics.likes,
        comments: post.metrics.comments,
        shares: post.metrics.shares,
        saves: post.metrics.saves,
        impressions: post.metrics.impressions,
      })
      entry.totalEngagement += rate
      globalTotalEngagement += rate

      if (rate > entry.topEngagement) {
        entry.topEngagement = rate
        entry.topPostId = post.id
      }
    }
  }

  const byPlatform: PlatformPerformance[] = []
  let bestPlatform: string | null = null
  let bestAvgRate = -1

  for (const [platform, data] of byPlatformMap) {
    const avgEngagementRate = data.postCount > 0 ? data.totalEngagement / data.postCount : 0
    byPlatform.push({ platform, postCount: data.postCount, avgEngagementRate, topPostId: data.topPostId })
    if (avgEngagementRate > bestAvgRate) {
      bestAvgRate = avgEngagementRate
      bestPlatform = platform
    }
  }

  const avgEngagementRate = posts.length > 0 ? globalTotalEngagement / posts.length : 0

  const topicCounts = new Map<string, number>()
  for (const post of posts) {
    if (post.topic) {
      topicCounts.set(post.topic, (topicCounts.get(post.topic) ?? 0) + 1)
    }
  }
  let topContentTheme: string | null = null
  let maxCount = 0
  for (const [topic, count] of topicCounts) {
    if (count > maxCount) { maxCount = count; topContentTheme = topic }
  }

  return { totalPosts: posts.length, avgEngagementRate, bestPlatform, topContentTheme, byPlatform }
}

export async function generateReportData(
  metrics: ReportMetrics,
  period: { from: string; to: string; label: string },
  region: string,
  brandProfile: { contentThemes?: string[]; voiceSummary?: string | null } | null
): Promise<ReportData> {
  const forwardMonths: string[] = []
  const periodEnd = new Date(period.to)
  for (let i = 1; i <= 3; i++) {
    const d = new Date(periodEnd)
    d.setMonth(d.getMonth() + i)
    forwardMonths.push(d.toLocaleString('en-AU', { month: 'long', year: 'numeric' }))
  }

  const platformSummary = metrics.byPlatform
    .map(p => `${p.platform}: ${p.postCount} posts, avg engagement ${(p.avgEngagementRate * 100).toFixed(1)}%`)
    .join('\n')

  const prompt = `You are a social media strategist generating a quarterly report for a ${region} business.

PERFORMANCE DATA (${period.label}):
- Total posts published: ${metrics.totalPosts}
- Overall average engagement rate: ${(metrics.avgEngagementRate * 100).toFixed(1)}%
- Best performing platform: ${metrics.bestPlatform ?? 'unknown'}
- Top content theme: ${metrics.topContentTheme ?? 'not determined'}
- By platform:
${platformSummary}

${brandProfile?.voiceSummary ? `BRAND VOICE: ${brandProfile.voiceSummary}` : ''}
${brandProfile?.contentThemes?.length ? `CONTENT THEMES: ${brandProfile.contentThemes.join(', ')}` : ''}

Generate a JSON response with exactly this structure (no markdown, no explanation — ONLY valid JSON):
{
  "insightNarrative": "3-4 sentences reviewing the quarter: what performed well, which platform led, one specific observation, one recommendation for improvement",
  "strategy": {
    "months": [
      {
        "month": "${forwardMonths[0]}",
        "contentPillars": ["3-4 content pillar names relevant to the brand"],
        "keyDates": [
          {
            "date": "YYYY-MM-DD",
            "name": "Key date or event name (${region} context)",
            "campaignIdea": "One sentence campaign idea"
          }
        ],
        "recommendedFrequency": [
          { "platform": "INSTAGRAM", "postsPerWeek": 4 }
        ]
      },
      {
        "month": "${forwardMonths[1]}",
        "contentPillars": [],
        "keyDates": [],
        "recommendedFrequency": []
      },
      {
        "month": "${forwardMonths[2]}",
        "contentPillars": [],
        "keyDates": [],
        "recommendedFrequency": []
      }
    ]
  }
}

Only include platforms in recommendedFrequency that appeared in the performance data. Key dates must be real dates for ${region}. Return ONLY the JSON object.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const aiData = JSON.parse(jsonText) as { insightNarrative: string; strategy: { months: unknown[] } }

  return {
    period,
    performance: {
      totalPosts: metrics.totalPosts,
      avgEngagementRate: metrics.avgEngagementRate,
      bestPlatform: metrics.bestPlatform,
      topContentTheme: metrics.topContentTheme,
      byPlatform: metrics.byPlatform,
      insightNarrative: aiData.insightNarrative,
    },
    strategy: aiData.strategy as ReportData['strategy'],
  }
}
