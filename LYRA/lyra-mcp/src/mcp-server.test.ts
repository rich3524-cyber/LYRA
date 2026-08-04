import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY } from './mcp-server'

describe('TOOL_REGISTRY', () => {
  it('registers exactly the 7 Phase 1 core tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'get_analytics',
      'get_brand_profile',
      'get_workspace_overview',
      'list_inbox_items',
      'list_scheduled_posts',
      'list_trends',
      'list_workspaces',
    ])
  })

  it('every registered tool has a non-empty description and a handler function', () => {
    for (const [name, tool] of Object.entries(TOOL_REGISTRY)) {
      expect(tool.description.length, `${name} description`).toBeGreaterThan(0)
      expect(typeof tool.handler, `${name} handler`).toBe('function')
    }
  })

  it('get_brand_profile’s description instructs calling it before generating content', () => {
    expect(TOOL_REGISTRY.get_brand_profile.description.toLowerCase()).toContain('before generating')
  })
})
