// app/api/oauth/register/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth0-management', () => ({
  createAuth0Client: vi.fn(),
}))

import { createAuth0Client } from '@/lib/auth0-management'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/oauth/register', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers a client and returns the RFC 7591 response shape', async () => {
    vi.mocked(createAuth0Client).mockResolvedValue({
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

    expect(createAuth0Client).toHaveBeenCalledWith({
      name:         'Claude',
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    })
  })

  it('defaults client_name when omitted', async () => {
    vi.mocked(createAuth0Client).mockResolvedValue({
      client_id: 'new-client-abc',
      name:      'MCP Client',
      callbacks: ['https://claude.ai/callback'],
    })

    await POST(req({ redirect_uris: ['https://claude.ai/callback'] }))

    expect(createAuth0Client).toHaveBeenCalledWith({
      name:         'MCP Client',
      redirectUris: ['https://claude.ai/callback'],
    })
  })

  it('rejects a request with no redirect_uris', async () => {
    const res = await POST(req({ client_name: 'Claude' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_client_metadata')
    expect(createAuth0Client).not.toHaveBeenCalled()
  })

  it('rejects a request with an empty redirect_uris array', async () => {
    const res = await POST(req({ redirect_uris: [] }))
    expect(res.status).toBe(400)
    expect(createAuth0Client).not.toHaveBeenCalled()
  })

  it('rejects a non-https, non-localhost redirect_uri', async () => {
    const res = await POST(req({ redirect_uris: ['http://evil.example.com/callback'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_redirect_uri')
    expect(createAuth0Client).not.toHaveBeenCalled()
  })

  it('allows an http localhost redirect_uri for local development clients', async () => {
    vi.mocked(createAuth0Client).mockResolvedValue({
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

  it('returns 500 when Auth0 client creation fails', async () => {
    vi.mocked(createAuth0Client).mockRejectedValue(new Error('Auth0 Management API client creation failed: 500 boom'))
    const res = await POST(req({ redirect_uris: ['https://claude.ai/callback'] }))
    expect(res.status).toBe(500)
  })
})
