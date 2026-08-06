import { describe, it, expect } from 'vitest'
import { PROMPT_REGISTRY } from './prompts'

describe('PROMPT_REGISTRY', () => {
  it('has exactly the 4 prompts named in the parent spec', () => {
    expect(Object.keys(PROMPT_REGISTRY).sort()).toEqual([
      'plan_next_week',
      'summarise_client_performance',
      'triage_inbox',
      'turn_trend_into_post',
    ])
  })

  it('every prompt has a non-empty description and message template', () => {
    for (const [name, prompt] of Object.entries(PROMPT_REGISTRY)) {
      expect(prompt.description.length, `${name} description`).toBeGreaterThan(0)
      expect(prompt.message.length, `${name} message`).toBeGreaterThan(0)
    }
  })

  it('plan_next_week reminds the caller to check brand voice before generating', () => {
    expect(PROMPT_REGISTRY.plan_next_week.message.toLowerCase()).toContain('brand')
  })

  it('triage_inbox mentions respecting autonomy mode', () => {
    expect(PROMPT_REGISTRY.triage_inbox.message.toLowerCase()).toContain('autonomy')
  })
})
