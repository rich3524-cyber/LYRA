import { describe, it, expect } from 'vitest'
import { checkGuardrailViolation } from './response-generator'
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
})
