// app/api/oauth/register/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth0-management', () => ({
  getOrCreateAuth0Client: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  getClientIp:    vi.fn(() => '127.0.0.1'),
}))

import { getOrCreateAuth0Client } from '@/lib/auth0-management'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/oauth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4 })
  })

  it('registers a client and returns the RFC 7591 response shape', async () => {
    vi.mocked(getOrCreateAuth0Client).mockResolvedValue({
      client_id: 'new-client-abc',
      name:      'Claude',
      callbacks: ['https://claude.ai/api/mcp/auth_callback'],
    })

    const res = await POST(req({
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      client_name:   'Claude',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({
      client_id:                  'new-client-abc',
      client_name:                'Claude',
      redirect_uris:              ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'none',
      grant_types:                ['authorization_code', 'refresh_token'],
      response_types:             ['code'],
    })
    expect(typeof body.client_id_issued_at).toBe('number')

    expect(getOrCreateAuth0Client).toHaveBeenCalledWith({
      name:         'Claude',
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    })
  })

  it('defaults client_name when omitted', async () => {
    vi.mocked(getOrCreateAuth0Client).mockResolvedValue({
      client_id: 'new-client-abc',
      name:      'MCP Client',
      callbacks: ['https://claude.ai/callback'],
    })

    await POST(req({ redirect_uris: ['https://claude.ai/callback'] }))

    expect(getOrCreateAuth0Client).toHaveBeenCalledWith({
      name:         'MCP Client',
      redirectUris: ['https://claude.ai/callback'],
    })
  })

  it('rejects a request with no redirect_uris', async () => {
    const res = await POST(req({ client_name: 'Claude' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_client_metadata')
    expect(getOrCreateAuth0Client).not.toHaveBeenCalled()
  })

  it('rejects a request with an empty redirect_uris array', async () => {
    const res = await POST(req({ redirect_uris: [] }))
    expect(res.status).toBe(400)
    expect(getOrCreateAuth0Client).not.toHaveBeenCalled()
  })

  it('rejects a non-https, non-localhost redirect_uri', async () => {
    const res = await POST(req({ redirect_uris: ['http://evil.example.com/callback'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_redirect_uri')
    expect(getOrCreateAuth0Client).not.toHaveBeenCalled()
  })

  it('allows an http localhost redirect_uri for local development clients', async () => {
    vi.mocked(getOrCreateAuth0Client).mockResolvedValue({
      client_id: 'new-client-abc',
      name:      'Local Dev Client',
      callbacks: ['http://localhost:3000/callback'],
    })
    const res = await POST(req({ redirect_uris: ['http://localhost:3000/callback'], client_name: 'Local Dev Client' }))
    expect(res.status).toBe(201)
  })

  it('returns 400 on malformed JSON body', async () => {
    const res = await POST(new Request('http://localhost/api/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 500 when Auth0 client creation fails, without leaking internal error details', async () => {
    vi.mocked(getOrCreateAuth0Client).mockRejectedValue(new Error('Auth0 Management API client creation failed: 500 boom'))
    const res = await POST(req({ redirect_uris: ['https://claude.ai/callback'] }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'server_error' })
  })

  it('returns 400 when the request body is the literal JSON null', async () => {
    const res = await POST(req(null))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_client_metadata')
    expect(getOrCreateAuth0Client).not.toHaveBeenCalled()
  })

  it('rejects a redirect_uris array with more than 10 entries', async () => {
    const manyUris = Array.from({ length: 11 }, (_, i) => `https://claude.ai/callback/${i}`)
    const res = await POST(req({ redirect_uris: manyUris }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_client_metadata')
    expect(getOrCreateAuth0Client).not.toHaveBeenCalled()
  })

  it('rejects a client_name longer than 500 characters', async () => {
    const res = await POST(req({
      redirect_uris: ['https://claude.ai/callback'],
      client_name:   'a'.repeat(501),
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_client_metadata')
    expect(getOrCreateAuth0Client).not.toHaveBeenCalled()
  })

  it('returns 429 when the per-IP rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ redirect_uris: ['https://claude.ai/callback'] }))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('invalid_client_metadata')
    expect(getOrCreateAuth0Client).not.toHaveBeenCalled()
  })
})
