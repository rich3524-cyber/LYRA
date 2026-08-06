import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { CAPABILITY_REGISTRY } from './registry'
import { SCOPES_SUPPORTED } from '../http'

describe('CAPABILITY_REGISTRY', () => {
  it('has exactly 15 capabilities, each with a unique name', () => {
    const names = Object.keys(CAPABILITY_REGISTRY)
    expect(names).toHaveLength(15)
    expect(new Set(names).size).toBe(15)
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
})
