import { anthropic } from '@/lib/anthropic'
import { BrandProfile, Guardrail, Comment } from '@prisma/client'

export async function generateCommentResponse(
  comment: Comment,
  brandProfile: BrandProfile | null,
  guardrails: Guardrail[]
): Promise<{ response: string | null; shouldEscalate: boolean; escalationReason?: string }> {
  if (!brandProfile) {
    return { response: null, shouldEscalate: true, escalationReason: 'No brand profile configured' }
  }

  const neverDiscuss    = guardrails.filter(g => g.type === 'NEVER_DISCUSS').map(g => g.value)
  const neverUse        = guardrails.filter(g => g.type === 'NEVER_USE_WORD').map(g => g.value)
  const alwaysEscalate  = guardrails.filter(g => g.type === 'ALWAYS_ESCALATE').map(g => g.value)
  const approvedAnswers = guardrails.filter(g => g.type === 'APPROVED_ANSWER').map(g => g.value)

  // Check hard escalation triggers before calling Claude
  const commentLower = comment.content.toLowerCase()
  for (const trigger of alwaysEscalate) {
    if (commentLower.includes(trigger.toLowerCase())) {
      return { response: null, shouldEscalate: true, escalationReason: `Contains escalation trigger: "${trigger}"` }
    }
  }

  const voiceSummary   = brandProfile.voiceSummary ?? 'Professional and helpful'
  const toneAttributes = brandProfile.toneAttributes.join(', ') || 'professional, friendly'

  const prompt = `You are responding to a social media comment on behalf of a brand.

BRAND VOICE:
${voiceSummary}
Tone: ${toneAttributes}

${approvedAnswers.length > 0 ? `APPROVED ANSWERS TO USE WHEN RELEVANT:\n${approvedAnswers.join('\n')}\n` : ''}
COMMENT TO RESPOND TO:
"${comment.content}"
Posted by: ${comment.authorName}

STRICT RULES — NEVER BREAK THESE:
- NEVER discuss: ${neverDiscuss.join(', ') || 'nothing restricted'}
- NEVER use these words/phrases: ${neverUse.join(', ') || 'none restricted'}
- Keep response under 280 characters for most platforms
- Be genuine, on-brand, and helpful
- Never make promises about refunds, legal matters, or specific timeframes
- If the comment is negative, acknowledge and offer to help via DM — never argue

If you cannot respond appropriately without breaking any rules, respond with exactly: ESCALATE

Write only the response — no explanation.`

  const apiResponse = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = apiResponse.content[0].type === 'text' ? apiResponse.content[0].text.trim() : ''

  if (text === 'ESCALATE') {
    return { response: null, shouldEscalate: true, escalationReason: 'AI determined escalation required' }
  }

  return { response: text, shouldEscalate: false }
}
