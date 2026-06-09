// services/trends/trend-syncer.ts
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import { queryPerplexity } from '@/services/ai-visibility/perplexity'

interface TrendCandidate {
  title:          string
  description:    string
  sourcePlatform: string
  sourceUrl?:     string
}

function buildPerplexityPrompt(industry: string, contentThemes: string[], audience: string): string {
  const themes = contentThemes.join(', ')
  return `What is trending RIGHT NOW on TikTok, Instagram Reels, X (Twitter), Reddit, and news for the ${industry} industry? Focus on trends relevant to: ${themes}. Target audience: ${audience}.

List the top 10 trending topics, formats, or conversations. For each trend, state:
1. The trend title (short)
2. A one-sentence description of what it is
3. Which platform it is most prominent on (TIKTOK, INSTAGRAM, X, REDDIT, NEWS, or WEB)
4. A source URL if available

Format as a numbered list. Be specific — name actual trends, not categories.`
}

function buildScoringPrompt(candidates: TrendCandidate[], brandContext: string): string {
  const candidateList = candidates
    .map((c, i) => `${i + 1}. [${c.sourcePlatform}] ${c.title}: ${c.description}`)
    .join('\n')

  return `You are a brand strategist. Score each trend below for relevance to this brand on a scale of 0-100. Then write a one-sentence explanation of why it fits (or doesn't).

BRAND CONTEXT:
${brandContext}

TRENDS TO SCORE:
${candidateList}

Return a JSON array only - no markdown, no wrapper text:
[
  { "index": 1, "score": 85, "whyItFits": "Matches your educational voice and marketing audience." },
  ...
]`
}

function parseCandidatesFromText(text: string): TrendCandidate[] {
  const candidates: TrendCandidate[] = []
  const lines = text.split('\n').filter(l => l.trim())

  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/)
    if (!match) continue
    const content = match[1].trim()
    const parts = content.split(':')
    if (parts.length < 2) continue

    const title = parts[0].trim()
    const rest = parts.slice(1).join(':').trim()

    let sourcePlatform = 'WEB'
    let description = rest
    let sourceUrl: string | undefined

    const platformMatch = rest.match(/\[(TIKTOK|INSTAGRAM|X|REDDIT|NEWS|WEB)\]/i)
    if (platformMatch) {
      sourcePlatform = platformMatch[1].toUpperCase()
      description = rest.replace(platformMatch[0], '').trim()
    }

    const urlMatch = description.match(/https?:\/\/\S+/)
    if (urlMatch) {
      sourceUrl = urlMatch[0]
      description = description.replace(urlMatch[0], '').trim()
    }

    if (title && description) {
      candidates.push({ title, description, sourcePlatform, sourceUrl })
    }
  }

  return candidates.slice(0, 15)
}

export async function syncTrendsForWorkspace(workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where:   { id: workspaceId },
    select:  {
      id:           true,
      trendEnabled: true,
      industry:     true,
      brandProfile: {
        select: {
          voiceSummary:    true,
          contentThemes:   true,
          audienceProfile: true,
        }
      }
    }
  })

  if (!workspace?.trendEnabled) return
  if (!workspace.brandProfile) {
    console.log(`[trend-sync] workspace ${workspaceId}: no brand profile - skipping`)
    return
  }

  const { brandProfile, industry } = workspace
  const contentThemes   = (brandProfile.contentThemes  as string[] | null) ?? []
  const audienceProfile = brandProfile.audienceProfile as Record<string, unknown> | null
  const audience        = (audienceProfile?.demographics as string) ?? 'general audience'
  const voiceSummary    = brandProfile.voiceSummary ?? ''

  const industryLabel = industry ?? 'marketing'

  // 1. Perplexity query for trending topics
  const prompt = buildPerplexityPrompt(industryLabel, contentThemes, audience)
  const { content } = await queryPerplexity(prompt)

  // 2. Parse into candidates
  const candidates = parseCandidatesFromText(content)
  if (candidates.length === 0) {
    console.log(`[trend-sync] workspace ${workspaceId}: no candidates parsed`)
    return
  }

  // 3. Claude scores each candidate
  const brandContext = `Industry: ${industryLabel}. Voice: ${voiceSummary}. Themes: ${contentThemes.join(', ')}. Audience: ${audience}.`
  const scoringPrompt = buildScoringPrompt(candidates, brandContext)

  const scoringRes = await anthropic.messages.create({
    model:      CLAUDE_MODEL,
    max_tokens: 800,
    messages:   [{ role: 'user', content: scoringPrompt }]
  })

  const rawJson = scoringRes.content[0].type === 'text' ? scoringRes.content[0].text.trim() : '[]'

  let scores: { index: number; score: number; whyItFits: string }[] = []
  try {
    scores = JSON.parse(rawJson)
  } catch {
    console.error(`[trend-sync] workspace ${workspaceId}: failed to parse Claude scoring response`)
    return
  }

  // 4. Merge candidates with scores, take top 20 by score
  const scored = scores
    .map(s => {
      const candidate = candidates[s.index - 1]
      if (!candidate) return null
      return {
        workspaceId,
        title:          candidate.title,
        description:    candidate.description,
        whyItFits:      s.whyItFits,
        sourcePlatform: candidate.sourcePlatform,
        relevanceScore: Math.min(100, Math.max(0, s.score)),
        sourceUrl:      candidate.sourceUrl ?? null,
        status:         'NEW' as const,
        syncedAt:       new Date(),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 20)

  // 5. Delete previous items and insert fresh batch
  await prisma.$transaction([
    prisma.trendItem.deleteMany({ where: { workspaceId } }),
    prisma.trendItem.createMany({ data: scored }),
  ])

  console.log(`[trend-sync] workspace ${workspaceId}: ${scored.length} trends saved`)
}
