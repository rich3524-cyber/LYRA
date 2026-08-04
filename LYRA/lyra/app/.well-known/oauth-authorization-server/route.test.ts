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
      issuer:                                'https://test-tenant.auth0.com/',
      authorization_endpoint:                'https://test-tenant.auth0.com/authorize',
      token_endpoint:                        'https://test-tenant.auth0.com/oauth/token',
      registration_endpoint:                 'https://lyraonline.ai/api/oauth/register',
      jwks_uri:                              'https://test-tenant.auth0.com/.well-known/jwks.json',
      response_types_supported:              ['code'],
      grant_types_supported:                 ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported:      ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [
        'openid', 'profile', 'email',
        'workspaces:read', 'content:read', 'content:write',
        'inbox:respond', 'settings:write', 'reports:read',
      ],
    })
  })

  it('sets a cache-control header, since this document changes only on deploy', async () => {
    const res = await GET()
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
  })
})
