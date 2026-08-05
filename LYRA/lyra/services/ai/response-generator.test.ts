import { describe, it, expect } from 'vitest'
import { checkGuardrailViolation, checkAlwaysEscalate } from './response-generator'
import type { Guardrail } from '@prisma/client'

function guardrail(type: Guardrail['type'], value: string): Guardrail {
  return { id: 'g1', workspaceId: 'ws-1', type, value } as Guardrail
}

describe('checkGuardrailViolation', () => {
  it('returns null when the text violates nothing', () => {
    const result = checkGuardrailViolation('Thanks for reaching out!', [guardrail('NEVER_DISCUSS', 'pricing')])
    expect(result).toBeNull()
  })

  it('detects a NEVER_USE_WORD violation, case-insensitively', () => {
    const result = checkGuardrailViolation('This is a GUARANTEED result', [guardrail('NEVER_USE_WORD', 'guaranteed')])
    expect(result).toEqual({ rule: 'NEVER_USE_WORD', value: 'guaranteed' })
  })

  it('detects a NEVER_DISCUSS violation, case-insensitively', () => {
    const result = checkGuardrailViolation('Our Pricing starts at $99', [guardrail('NEVER_DISCUSS', 'pricing')])
    expect(result).toEqual({ rule: 'NEVER_DISCUSS', value: 'pricing' })
  })

  it('ignores guardrail types other than NEVER_USE_WORD/NEVER_DISCUSS', () => {
    const result = checkGuardrailViolation('some text', [guardrail('ALWAYS_ESCALATE', 'some text')])
    expect(result).toBeNull()
  })

  it('ignores guardrails with an empty value', () => {
    expect(checkGuardrailViolation('any text at all', [guardrail('NEVER_USE_WORD', '')])).toBeNull()
  })
})

describe('checkAlwaysEscalate', () => {
  it('returns null when the comment matches no ALWAYS_ESCALATE trigger', () => {
    const result = checkAlwaysEscalate('Love this post!', [guardrail('ALWAYS_ESCALATE', 'refund')])
    expect(result).toBeNull()
  })

  it('detects an ALWAYS_ESCALATE trigger, case-insensitively', () => {
    const result = checkAlwaysEscalate('I want a REFUND immediately', [guardrail('ALWAYS_ESCALATE', 'refund')])
    expect(result).toEqual({ trigger: 'refund' })
  })

  it('ignores guardrail types other than ALWAYS_ESCALATE', () => {
    const result = checkAlwaysEscalate('a refund please', [guardrail('NEVER_DISCUSS', 'refund')])
    expect(result).toBeNull()
  })

  it('ignores guardrails with an empty value', () => {
    expect(checkAlwaysEscalate('any text at all', [guardrail('ALWAYS_ESCALATE', '')])).toBeNull()
  })
})
