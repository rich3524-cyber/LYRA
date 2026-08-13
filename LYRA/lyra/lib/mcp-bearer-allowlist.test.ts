import { describe, expect, it } from 'vitest'
import { isAllowedBearerRoute, isRestrictedBearerRoute } from './mcp-bearer-allowlist'

describe('isRestrictedBearerRoute', () => {
  it('restricts ordinary API routes', () => {
    expect(isRestrictedBearerRoute('/api/posts')).toBe(true)
    expect(isRestrictedBearerRoute('/api/workspaces/abc123')).toBe(true)
  })

  it('does not restrict non-API routes', () => {
    expect(isRestrictedBearerRoute('/workspace/abc123')).toBe(false)
    expect(isRestrictedBearerRoute('/')).toBe(false)
  })

  it('exempts cron routes, which authenticate via CRON_SECRET, not a user bearer token', () => {
    expect(isRestrictedBearerRoute('/api/cron/sync-comments')).toBe(false)
    expect(isRestrictedBearerRoute('/api/cron/publish-due-posts')).toBe(false)
  })
})

describe('isAllowedBearerRoute', () => {
  it('allows every fixed-path MCP tool route', () => {
    expect(isAllowedBearerRoute('GET', '/api/workspaces')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/upload/from-url')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/upload/media-presign')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/ai/score-content')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/posts')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/posts')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/analytics')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/brand-intelligence/profile')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/comments/unread-count')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/comments')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/crisis/status')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/trends')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/mcp/audit')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/mcp/respond-to-item')).toBe(true)
  })

  it('allows every call_capability registry route, including :param substitution', () => {
    expect(isAllowedBearerRoute('GET', '/api/competitors')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/competitors')).toBe(true)
    expect(isAllowedBearerRoute('DELETE', '/api/competitors/comp_123')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/seo/gsc-data')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/seo/pages')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/seo/pages')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/seo/pages/page_1/analyze')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/seo/pages/page_1/generate')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/brand-intelligence/analyze-engagement')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/brand-intelligence/build')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/brand-intelligence/crisis-keywords/approve')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/brand-intelligence/crisis-keywords/dismiss')).toBe(true)
    expect(isAllowedBearerRoute('DELETE', '/api/guardrails/gr_1')).toBe(true)
    expect(isAllowedBearerRoute('GET', '/api/email-campaigns')).toBe(true)
    expect(isAllowedBearerRoute('POST', '/api/schedule/generate')).toBe(true)
  })

  it('allows GET /api/workspaces/:id with a dynamic id segment', () => {
    expect(isAllowedBearerRoute('GET', '/api/workspaces/ws_abc123')).toBe(true)
  })

  it('rejects a route not in the allowlist', () => {
    expect(isAllowedBearerRoute('GET', '/api/settings')).toBe(false)
    expect(isAllowedBearerRoute('DELETE', '/api/workspaces/ws_abc123')).toBe(false)
    expect(isAllowedBearerRoute('POST', '/api/stripe/webhook')).toBe(false)
  })

  it('rejects the right method on an otherwise-allowed path', () => {
    expect(isAllowedBearerRoute('DELETE', '/api/posts')).toBe(false)
  })

  it('does not let a :param segment match a deeper or shallower path', () => {
    expect(isAllowedBearerRoute('GET', '/api/workspaces/ws_1/extra')).toBe(false)
    expect(isAllowedBearerRoute('DELETE', '/api/competitors')).toBe(false)
  })
})
