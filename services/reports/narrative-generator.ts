import { anthropic } from '@/lib/anthropic'
import { ReportData } from './report-renderer'

export async function generateNarrative(data: Omit<ReportData, 'narrative'>): Promise<string> {
  const periodLabel = data.period === '7d' ? 'last 7 days' : 'last 30 days'

  const prompt = `Write a professional 2–3 paragraph performance summary for a social media report.
Tone: direct, analytical, no fluff. Use active voice. Reference actual numbers from the data.
Do not use headings or bullet points — flowing paragraphs only.

Workspace: ${data.workspaceName}
Period: ${periodLabel}
Total posts: ${data.summary.totalPosts}
Total impressions: ${data.summary.totalImpressions.toLocaleString()}
Total engagements: ${data.summary.totalEngagements.toLocaleString()}
Average engagement rate: ${data.summary.avgEngRate.toFixed(2)}%
Best-performing platform: ${data.summary.bestPlatform}

Platform breakdown:
${data.platforms.map((p) => `${p.platform}: ${p.posts} posts, ${p.impressions.toLocaleString()} impressions, ${p.engagements.toLocaleString()} engagements, ${p.engRate.toFixed(2)}% engagement rate`).join('\n')}

Top posts by engagement:
${data.topPosts.map((p, i) => `${i + 1}. ${p.platform} (${p.scheduledAt}): ${p.impressions.toLocaleString()} impressions, ${p.engagements.toLocaleString()} engagements — "${p.contentExcerpt}"`).join('\n')}
`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    return response.content[0].type === 'text' ? response.content[0].text : ''
  } catch {
    // Graceful degradation — report generated without narrative
    return ''
  }
}
