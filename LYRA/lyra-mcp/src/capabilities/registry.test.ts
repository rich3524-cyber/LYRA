import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { CAPABILITY_REGISTRY } from './registry'
import { SCOPES_SUPPORTED } from '../http'

describe('CAPABILITY_REGISTRY', () => {
  it('has exactly 16 capabilities, each with a unique name', () => {
    const names = Object.keys(CAPABILITY_REGISTRY)
    expect(names).toHaveLength(16)
    expect(new Set(names).size).toBe(16)
  })

  it('every capability has a non-empty description, a valid endpoint/method, and a Zod paramSchema', () => {
    for (const [name, cap] of Object.entries(CAPABILITY_REGISTRY)) {
      expect(cap.description.length, `${name} description`).toBeGreaterThan(0)
      expect(['GET', 'POST', 'DELETE'], `${name} method`).toContain(cap.method)
      expect(cap.endpoint.startsWith('/api/'), `${name} endpoint`).toBe(true)
      expect(typeof cap.paramSchema.safeParse, `${name} paramSchema`).toBe('function')
      expect(['STARTER', 'PRO', 'AGENCY'], `${name} minPlanTier`).toContain(cap.minPlanTier)
      expect(typeof cap.mutates, `${name} mutates`).toBe('boolean')
      // requiredScope must be one of the scopes this gateway actually
      // issues/accepts (src/http.ts) -- a typo here would compile (bare
      // string) but fail closed at runtime for every call to that capability.
      expect(SCOPES_SUPPORTED, `${name} requiredScope`).toContain(cap.requiredScope)
    }
  })

  it('every capability declares a valid workspaceScoping, so call_capability never has to infer scoping behavior from the endpoint string', () => {
    for (const [name, cap] of Object.entries(CAPABILITY_REGISTRY)) {
      expect(['explicit', 'derived-from-path'], `${name} workspaceScoping`).toContain(cap.workspaceScoping)
    }
  })

  it("declares 'derived-from-path' only for the four path-parameterized capabilities that don't send workspaceId, per the design decision in call_capability", () => {
    const derivedFromPath = Object.entries(CAPABILITY_REGISTRY)
      .filter(([, cap]) => cap.workspaceScoping === 'derived-from-path')
      .map(([name]) => name)
      .sort()
    expect(derivedFromPath).toEqual(['analyze_seo_page', 'generate_seo_content', 'remove_competitor', 'remove_guardrail'])
  })

  it('path-parameterized endpoints declare every :placeholder as a required string field in paramSchema', () => {
    for (const [name, cap] of Object.entries(CAPABILITY_REGISTRY)) {
      const placeholders = [...cap.endpoint.matchAll(/:(\w+)/g)].map((m) => m[1])
      if (placeholders.length === 0) continue
      for (const p of placeholders) {
        // requiredness: the whole object must reject when the path param is absent
        expect(cap.paramSchema.safeParse({}).success, `${name} must require ${p}`).toBe(false)
        // type: path params are interpolated into a URL, so they must be strings
        const shape = (cap.paramSchema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape
        expect(shape[p].safeParse('x').success, `${name}.${p} must accept a string`).toBe(true)
      }
    }
  })

  it('only list_competitors, get_seo_search_data, and analyze_seo_page carry wrapsUntrustedContent, per the design spec (these are the v1 capabilities returning third-party content)', () => {
    const flagged = Object.entries(CAPABILITY_REGISTRY)
      .filter(([, cap]) => cap.wrapsUntrustedContent)
      .map(([name]) => name)
      .sort()
    expect(flagged).toEqual(['analyze_seo_page', 'get_seo_search_data', 'list_competitors'])
  })

  it("rejects a too-short or purely-symbolic approve_crisis_keyword keyword, since the backend matches it via case-insensitive substring against every future comment", () => {
    const schema = CAPABILITY_REGISTRY.approve_crisis_keyword.paramSchema
    expect(schema.safeParse({ keyword: 'e' }).success).toBe(false)
    expect(schema.safeParse({ keyword: 'ab' }).success).toBe(false)
    expect(schema.safeParse({ keyword: '!!!' }).success, 'purely-symbolic keyword').toBe(false)
    expect(schema.safeParse({ keyword: '123' }).success, 'purely-numeric keyword').toBe(false)
    expect(schema.safeParse({ keyword: 'lawsuit' }).success).toBe(true)
  })

  it('exposes remove_guardrail, the undo path for approve_crisis_keyword, backed by the real DELETE /api/guardrails/:id route', () => {
    const cap = CAPABILITY_REGISTRY.remove_guardrail
    expect(cap.endpoint).toBe('/api/guardrails/:id')
    expect(cap.method).toBe('DELETE')
    expect(cap.paramSchema.safeParse({}).success, 'id should be required').toBe(false)
    expect(cap.paramSchema.safeParse({ id: 'guardrail-1' }).success).toBe(true)
    expect(cap.workspaceScoping).toBe('derived-from-path')
    expect(cap.mutates).toBe(true)
  })
})
