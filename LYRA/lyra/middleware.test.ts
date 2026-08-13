import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

function makeRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(url, 'https://lyra.example.com'), init)
}

describe('middleware', () => {
  it('sets x-pathname on a normal page request with no bearer token', async () => {
    const res = middleware(makeRequest('/workspace/abc'))
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/workspace/abc')
  })

  it('passes through an API request with no Authorization header', async () => {
    const res = middleware(makeRequest('/api/posts'))
    expect(res.status).toBe(200)
  })

  it('passes through an API request authenticated with a session cookie, not a bearer token', async () => {
    const res = middleware(makeRequest('/api/posts', { headers: { cookie: 'auth0.session=abc' } }))
    expect(res.status).toBe(200)
  })

  it('allows a bearer token on a route the MCP gateway actually calls', async () => {
    const res = middleware(
      makeRequest('/api/posts', { method: 'POST', headers: { authorization: 'Bearer sometoken' } })
    )
    expect(res.status).toBe(200)
  })

  it('allows a bearer token on a dynamic-segment route the MCP gateway actually calls', async () => {
    const res = middleware(
      makeRequest('/api/workspaces/ws_1', { headers: { authorization: 'Bearer sometoken' } })
    )
    expect(res.status).toBe(200)
  })

  it('rejects a bearer token on a route outside the MCP gateway allowlist', async () => {
    const res = middleware(
      makeRequest('/api/workspaces/ws_1', { method: 'DELETE', headers: { authorization: 'Bearer sometoken' } })
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/bearer/i)
  })

  it('does not restrict cron routes, which use a static CRON_SECRET as their bearer value', async () => {
    const res = middleware(
      makeRequest('/api/cron/sync-comments', { headers: { authorization: 'Bearer some-cron-secret' } })
    )
    expect(res.status).toBe(200)
  })
})
