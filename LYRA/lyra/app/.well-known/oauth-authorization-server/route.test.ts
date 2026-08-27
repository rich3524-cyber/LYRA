// app/.well-known/oauth-authorization-server/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com'
  process.env.APP_BASE_URL = 'https://lyraonline.ai'
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('GET /.well-known/oauth-authorization-server', () => {
  it('returns a well-formed RFC 8414 metadata document pointing at Auth0 and the local DCR shim', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toEqual({
      issuer:                                'https://lyraonline.ai',
      authorization_endpoint:                'https://test-tenant.auth0.com/authorize',
      token_endpoint:                        'https://test-tenant.auth0.com/oauth/token',
      registration_endpoint:                 'https://lyraonline.ai/api/oauth/register',
      jwks_uri:                              'https://test-tenant.auth0.com/.well-known/jwks.json',
      response_types_supported:              ['code'],
      grant_types_supported:                 ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported:      ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [
        'openid', 'profile', 'email', 'offline_access',
        'workspaces:read', 'content:read', 'content:write',
        'inbox:respond', 'settings:write', 'reports:read',
      ],
    })
  })

  it('sets a cache-control header, since this document changes only on deploy', async () => {
    const res = await GET()
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
  })

  // offline_access is what makes Auth0 actually issue a refresh token during
  // the authorize call. Without it advertised here, a connector building its
  // consent request from this document (the common case) never asks for one,
  // gets only a short-lived access token, and needs a full manual reconnect
  // once it expires instead of a silent refresh -- this was a real bug.
  it('advertises offline_access so connectors request a refresh token, not just a short-lived access token', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.scopes_supported).toContain('offline_access')
  })
})
