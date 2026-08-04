import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'

vi.mock('./jwt-verify', () => ({ verifyAuth0AccessToken: vi.fn() }))

import { verifyAuth0AccessToken } from './jwt-verify'
import { createApp } from './http'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.APP_BASE_URL = 'https://mcp.lyraonline.ai'
  process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com'
  vi.clearAllMocks()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('GET /health', () => {
  it('returns 200 with no auth required', async () => {
    const app = createApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })
})

describe('GET /.well-known/oauth-protected-resource', () => {
  it('returns the RFC 9728 metadata document with no auth required', async () => {
    const app = createApp()
    const res = await request(app).get('/.well-known/oauth-protected-resource')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      resource: 'https://mcp.lyraonline.ai/mcp',
      authorization_servers: ['https://lyraonline.ai'],
      bearer_methods_supported: ['header'],
      scopes_supported: [
        'openid', 'profile', 'email',
        'workspaces:read', 'content:read', 'content:write',
        'inbox:respond', 'settings:write', 'reports:read',
      ],
    })
  })
})

describe('bearer auth middleware (applied to /mcp)', () => {
  it('returns 401 with a WWW-Authenticate header pointing at the resource metadata when no Authorization header is present', async () => {
    const app = createApp()
    const res = await request(app).post('/mcp').send({})
    expect(res.status).toBe(401)
    expect(res.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://mcp.lyraonline.ai/.well-known/oauth-protected-resource"'
    )
    expect(verifyAuth0AccessToken).not.toHaveBeenCalled()
  })

  it('returns 401 when the token fails verification', async () => {
    vi.mocked(verifyAuth0AccessToken).mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer bad-token').send({})
    expect(res.status).toBe(401)
    expect(res.headers['www-authenticate']).toContain('Bearer')
  })

  it('calls next() and attaches req.auth when the token is valid', async () => {
    vi.mocked(verifyAuth0AccessToken).mockResolvedValue({ sub: 'auth0|user123', scope: 'workspaces:read content:read' })
    const app = createApp()
    // /mcp has no downstream handler mounted yet in this task -- a valid
    // token should reach past the auth middleware and 404 (no route),
    // not 401 (auth rejected).
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer good-token').send({})
    expect(res.status).not.toBe(401)
  })
})
