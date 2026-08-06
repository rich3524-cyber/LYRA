import { describe, it, expect } from 'vitest'
import { PROMPT_REGISTRY } from './prompts'
import { TOOL_REGISTRY } from './mcp-server'
import { CAPABILITY_REGISTRY } from './capabilities/registry'

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

  // Registry-drift guard: every snake_case identifier a prompt message names
  // (e.g. "get_seo_search_data") must actually exist as a registered tool or
  // capability -- catches the exact bug class where a message referenced a
  // capability (generate_report-equivalent) that was never in the registry.
  it('every snake_case tool/capability name mentioned in a prompt message actually exists', () => {
    const knownNames = new Set([...Object.keys(TOOL_REGISTRY), ...Object.keys(CAPABILITY_REGISTRY)])
    for (const [promptName, prompt] of Object.entries(PROMPT_REGISTRY)) {
      const mentioned = prompt.message.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []
      for (const name of mentioned) {
        expect(knownNames.has(name), `${promptName} message mentions unknown name "${name}"`).toBe(true)
      }
    }
  })
})
