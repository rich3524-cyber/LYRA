import { prisma } from '@/lib/prisma'
import { anthropic } from '@/lib/anthropic'

type Comment = { id: string; content: string }

type DetectResult =
  | { triggered: false }
  | { triggered: true; type: 'KEYWORD_MATCH' | 'SENTIMENT_SPIKE'; commentIds: string[] }

export async function detectCrisis(
  workspaceId: string,
  comments: Comment[]
): Promise<DetectResult> {
  if (comments.length === 0) return { triggered: false }

  // 1. Keyword check — no Claude call needed
  const guardrails = await prisma.guardrail.findMany({
    where: { workspaceId, type: 'ALWAYS_ESCALATE' },
    select: { value: true },
  })

  const keywords = guardrails.map((g) => g.value.toLowerCase())
  const keywordHits = comments.filter((c) =>
    keywords.some((kw) => c.content.toLowerCase().includes(kw))
  )

  if (keywordHits.length > 0) {
    return { triggered: true, type: 'KEYWORD_MATCH', commentIds: keywordHits.map((c) => c.id) }
  }

  // 2. Sentiment check via Claude
  const prompt = `Score each comment's sentiment from -1 (very negative) to +1 (very positive).
Return ONLY valid JSON: an array of objects with "id" and "score" keys.
Comments:
${JSON.stringify(comments.map((c) => ({ id: c.id, content: c.content })))}
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  let scores: { id: string; score: number }[] = []
  try {
    scores = JSON.parse(text)
  } catch {
    // If Claude returns malformed JSON, don't trigger — fail open
    return { triggered: false }
  }

  const negativeHits = scores.filter((s) => s.score < -0.6)

  if (negativeHits.length >= 3) {
    return {
      triggered: true,
      type: 'SENTIMENT_SPIKE',
      commentIds: negativeHits.map((s) => s.id),
    }
  }

  return { triggered: false }
}
