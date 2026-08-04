import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAuth0Client } from './auth0-management'

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com'
  process.env.AUTH0_MGMT_CLIENT_ID = 'mgmt-client-id'
  process.env.AUTH0_MGMT_CLIENT_SECRET = 'mgmt-client-secret'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.unstubAllGlobals()
})

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>) {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
      text: async () => r.text ?? '',
    })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('createAuth0Client', () => {
  it('fetches a Management API token then creates a client, returning client_id and callbacks', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: true, json: { client_id: 'new-client-123', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
    ])

    const result = await createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    expect(result).toEqual({ client_id: 'new-client-123', name: 'Claude', callbacks: ['https://claude.ai/callback'] })

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://test-tenant.auth0.com/oauth/token')
    expect(tokenInit.headers).toEqual({ 'Content-Type': 'application/json' })
    const tokenBody = JSON.parse(tokenInit.body as string)
    expect(tokenBody).toEqual({
      client_id: 'mgmt-client-id',
      client_secret: 'mgmt-client-secret',
      audience: 'https://test-tenant.auth0.com/api/v2/',
      grant_type: 'client_credentials',
    })

    const [clientUrl, clientInit] = fetchMock.mock.calls[1]
    expect(clientUrl).toBe('https://test-tenant.auth0.com/api/v2/clients')
    expect(clientInit.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer mgmt-token-abc' })
    const clientBody = JSON.parse(clientInit.body as string)
    expect(clientBody).toEqual({
      name: 'Claude',
      app_type: 'native',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      callbacks: ['https://claude.ai/callback'],
      jwt_configuration: { alg: 'RS256' },
      oidc_conformant: true,
      refresh_token: {
        rotation_type: 'rotating',
        expiration_type: 'expiring',
        leeway: 0,
      },
    })
  })

  it('fetches a fresh Management API token on every call, without caching', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: true, json: { client_id: 'client-1', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
      { ok: true, json: { access_token: 'mgmt-token-def' } },
      { ok: true, json: { client_id: 'client-2', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
    ])

    await createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })
    await createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    const tokenRequestCalls = fetchMock.mock.calls.filter(([url]) => url === 'https://test-tenant.auth0.com/oauth/token')
    expect(tokenRequestCalls).toHaveLength(2)
  })

  it('throws with the response body when the token request fails', async () => {
    mockFetchSequence([{ ok: false, status: 401, text: 'invalid_client' }])

    await expect(
      createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })
    ).rejects.toThrow('Auth0 Management API token request failed: 401 invalid_client')
  })

  it('throws with the response body when client creation fails', async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: false, status: 400, text: 'Payload validation error' },
    ])

    await expect(
      createAuth0Client({ name: 'Claude', redirectUris: ['not-a-url'] })
    ).rejects.toThrow('Auth0 Management API client creation failed: 400 Payload validation error')
  })
})
