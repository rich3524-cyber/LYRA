import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { CAPABILITY_REGISTRY } from './registry'

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
    }
  })

  it('path-parameterized endpoints declare every :placeholder as a required string field in paramSchema', () => {
    for (const [name, cap] of Object.entries(CAPABILITY_REGISTRY)) {
      const placeholders = [...cap.endpoint.matchAll(/:(\w+)/g)].map((m) => m[1])
      if (placeholders.length === 0) continue
      const shape = (cap.paramSchema as z.ZodObject<z.ZodRawShape>).shape
      for (const p of placeholders) {
        expect(shape[p], `${name} paramSchema.${p}`).toBeDefined()
      }
    }
  })

  it('only list_competitors carries wrapsUntrustedContent, per the design spec (competitor data is the one v1 capability returning third-party content)', () => {
    const flagged = Object.entries(CAPABILITY_REGISTRY).filter(([, cap]) => cap.wrapsUntrustedContent)
    expect(flagged.map(([name]) => name)).toEqual(['list_competitors'])
  })
})
