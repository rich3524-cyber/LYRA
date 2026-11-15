import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAuth0Client, getOrCreateAuth0Client } from './auth0-management'

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com'
  process.env.AUTH0_MGMT_CLIENT_ID = 'mgmt-client-id'
  process.env.AUTH0_MGMT_CLIENT_SECRET = 'mgmt-client-secret'
  // The Application whose login connections every DCR-provisioned client
  // mirrors -- without it there is no reference to copy from.
  process.env.AUTH0_CLIENT_ID = 'main-app-client-id'
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

// Every provisioning path now also enables login connections on the
// Application: one GET to list connections, then one PATCH per connection the
// main app uses. Appended wherever a client is created or reused.
const CONNECTIONS_OK = [
  {
    ok:   true,
    json: [
      { id: 'con_db', name: 'Username-Password-Authentication', enabled_clients: ['main-app-client-id'] },
      { id: 'con_unused', name: 'Some-Other-Connection', enabled_clients: ['unrelated-app'] },
    ],
  },
  { ok: true, json: {} },
]

describe('createAuth0Client', () => {
  it('fetches a Management API token then creates a client, returning client_id and callbacks', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: true, json: { client_id: 'new-client-123', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
      ...CONNECTIONS_OK,
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
      name: '[DCR] Claude',
      app_type: 'native',
      is_first_party: false,
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
      ...CONNECTIONS_OK,
      { ok: true, json: { access_token: 'mgmt-token-def' } },
      { ok: true, json: { client_id: 'client-2', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
      ...CONNECTIONS_OK,
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

describe('getOrCreateAuth0Client', () => {
  it('reuses an existing Application with the same name and redirect_uris instead of creating a new one', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      {
        ok:   true,
        json: [
          { client_id: 'other-client', name: 'Some Other App', callbacks: ['https://other.example/callback'], app_type: 'native' },
          { client_id: 'existing-claude', name: 'Claude', callbacks: ['https://claude.ai/callback'], app_type: 'native' },
        ],
      },
      ...CONNECTIONS_OK,
    ])

    const result = await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    expect(result).toEqual({ client_id: 'existing-claude', name: 'Claude', callbacks: ['https://claude.ai/callback'] })
    // Token fetch, client list, then the connection list + PATCH -- but still
    // no POST to create a new client.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/v2/clients'))).toBe(false)
    const [listUrl, listInit] = fetchMock.mock.calls[1]
    expect(listUrl).toBe(
      'https://test-tenant.auth0.com/api/v2/clients?fields=client_id,name,callbacks,app_type&include_fields=true&per_page=100'
    )
    expect(listInit.headers).toEqual({ Authorization: 'Bearer mgmt-token-abc' })
  })

  it('creates a new client when no existing Application matches both name and redirect_uris', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: true, json: [{ client_id: 'existing-claude', name: 'Claude', callbacks: ['https://claude.ai/callback'], app_type: 'native' }] },
      { ok: true, json: { client_id: 'new-client-xyz', name: 'Claude', callbacks: ['https://claude.ai/different-callback'] } },
      ...CONNECTIONS_OK,
    ])

    const result = await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/different-callback'] })

    expect(result).toEqual({ client_id: 'new-client-xyz', name: 'Claude', callbacks: ['https://claude.ai/different-callback'] })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('treats a matching name with a different set of redirect_uris as a different client', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      {
        ok:   true,
        json: [{ client_id: 'existing-claude', name: 'Claude', callbacks: ['https://claude.ai/a', 'https://claude.ai/b'], app_type: 'native' }],
      },
      { ok: true, json: { client_id: 'new-client-xyz', name: 'Claude', callbacks: ['https://claude.ai/a'] } },
      ...CONNECTIONS_OK,
    ])

    const result = await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/a'] })

    expect(result.client_id).toBe('new-client-xyz')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('falls through to creating a client when the list call fails, rather than hard-failing registration', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: false, status: 500, text: 'internal error' },
      { ok: true, json: { client_id: 'new-client-xyz', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
      ...CONNECTIONS_OK,
    ])

    const result = await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    expect(result.client_id).toBe('new-client-xyz')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('falls through to creating a client when the list call throws', async () => {
    const fn = vi.fn()
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'mgmt-token-abc' }), text: async () => '' })
    fn.mockRejectedValueOnce(new Error('network down'))
    fn.mockResolvedValueOnce({
      ok:     true,
      status: 200,
      json:   async () => ({ client_id: 'new-client-xyz', name: 'Claude', callbacks: ['https://claude.ai/callback'] }),
      text:   async () => '',
    })
    for (const body of CONNECTIONS_OK) {
      fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body.json, text: async () => '' })
    }
    vi.stubGlobal('fetch', fn)

    const result = await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    expect(result.client_id).toBe('new-client-xyz')
  })

  it('ignores a non-native Application that happens to share the same name and callbacks', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      {
        ok:   true,
        json: [{ client_id: 'm2m-app', name: 'Claude', callbacks: ['https://claude.ai/callback'], app_type: 'non_interactive' }],
      },
      { ok: true, json: { client_id: 'new-client-xyz', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
      ...CONNECTIONS_OK,
    ])

    const result = await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    expect(result.client_id).toBe('new-client-xyz')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})

// Creating a client through the Management API does NOT attach any connection
// to it -- only the dashboard's own create-application flow does that. A client
// with no connections cannot be logged into at all: Auth0 rejects the authorize
// request with "invalid_request: no connections enabled for the client", which
// is what every MCP client registering through this shim hit. The ones that
// worked had been toggled on by hand, which hid the gap.
describe('enabling login connections on a provisioned client', () => {
  const TOKEN_AND_CREATE = [
    { ok: true, json: { access_token: 'mgmt-token-abc' } },
    { ok: true, json: { client_id: 'new-client-123', name: 'Claude', callbacks: ['https://claude.ai/callback'] } },
  ]

  it('enables exactly the connections the main LYRA Application uses', async () => {
    const fetchMock = mockFetchSequence([...TOKEN_AND_CREATE, ...CONNECTIONS_OK])

    await createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    const [listUrl, listInit] = fetchMock.mock.calls[2]
    expect(listUrl).toBe(
      'https://test-tenant.auth0.com/api/v2/connections?fields=id,name,enabled_clients&include_fields=true&per_page=100'
    )
    expect(listInit.headers).toEqual({ Authorization: 'Bearer mgmt-token-abc' })

    // Only con_db lists the main app; con_unused must be left alone.
    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
    expect(patchCalls).toHaveLength(1)
    expect(patchCalls[0][0]).toBe('https://test-tenant.auth0.com/api/v2/connections/con_db')
  })

  // enabled_clients replaces wholesale rather than merging, so a careless PATCH
  // would silently cut every other Application off from the login connection.
  it('appends to enabled_clients and never removes an existing Application', async () => {
    const fetchMock = mockFetchSequence([
      ...TOKEN_AND_CREATE,
      {
        ok:   true,
        json: [{ id: 'con_db', name: 'db', enabled_clients: ['main-app-client-id', 'existing-other-app'] }],
      },
      { ok: true, json: {} },
    ])

    await createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(patchCall[1].body as string)).toEqual({
      enabled_clients: ['main-app-client-id', 'existing-other-app', 'new-client-123'],
    })
  })

  it('skips the PATCH when the client is already enabled on that connection', async () => {
    const fetchMock = mockFetchSequence([
      ...TOKEN_AND_CREATE,
      { ok: true, json: [{ id: 'con_db', name: 'db', enabled_clients: ['main-app-client-id', 'new-client-123'] }] },
    ])

    await createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
  })

  // Returning a client_id that cannot be logged into is the bug being fixed --
  // it fails later, at authorize time, with an error pointing nowhere near here.
  it('fails registration when connections cannot be listed, naming the missing scope', async () => {
    mockFetchSequence([...TOKEN_AND_CREATE, { ok: false, status: 403, text: 'insufficient_scope' }])

    await expect(
      createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })
    ).rejects.toThrow(/read:connections and update:connections/)
  })

  it('fails registration when the PATCH is rejected', async () => {
    mockFetchSequence([
      ...TOKEN_AND_CREATE,
      { ok: true, json: [{ id: 'con_db', name: 'db', enabled_clients: ['main-app-client-id'] }] },
      { ok: false, status: 403, text: 'insufficient_scope' },
    ])

    await expect(
      createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })
    ).rejects.toThrow(/update:connections/)
  })

  it('fails registration when no connection mirrors AUTH0_CLIENT_ID', async () => {
    mockFetchSequence([
      ...TOKEN_AND_CREATE,
      { ok: true, json: [{ id: 'con_db', name: 'db', enabled_clients: ['some-other-app'] }] },
    ])

    await expect(
      createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })
    ).rejects.toThrow(/nothing to mirror/)
  })

  // A connection whose enabled_clients the API did not return must be skipped,
  // not treated as empty -- PATCHing from a list we are unsure is complete is
  // how other Applications get disabled.
  it('ignores a connection with no enabled_clients field rather than assuming it is empty', async () => {
    const fetchMock = mockFetchSequence([
      ...TOKEN_AND_CREATE,
      {
        ok:   true,
        json: [
          { id: 'con_db', name: 'db', enabled_clients: ['main-app-client-id'] },
          { id: 'con_opaque', name: 'opaque' },
        ],
      },
      { ok: true, json: {} },
    ])

    await createAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    const patchUrls = fetchMock.mock.calls.filter(([, i]) => i?.method === 'PATCH').map(([u]) => u)
    expect(patchUrls).toEqual(['https://test-tenant.auth0.com/api/v2/connections/con_db'])
  })

  // Best-effort on the reuse path only: a client being reused has very likely
  // logged in before, so it must not stop working because this call failed.
  it('does not fail a reused client when enabling connections fails', async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: true, json: [{ client_id: 'existing-claude', name: 'Claude', callbacks: ['https://claude.ai/callback'], app_type: 'native' }] },
      { ok: false, status: 403, text: 'insufficient_scope' },
    ])

    const result = await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    expect(result.client_id).toBe('existing-claude')
  })

  it('retro-fixes a reused client that predates connection enabling', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'mgmt-token-abc' } },
      { ok: true, json: [{ client_id: 'old-claude', name: 'Claude', callbacks: ['https://claude.ai/callback'], app_type: 'native' }] },
      { ok: true, json: [{ id: 'con_db', name: 'db', enabled_clients: ['main-app-client-id'] }] },
      { ok: true, json: {} },
    ])

    await getOrCreateAuth0Client({ name: 'Claude', redirectUris: ['https://claude.ai/callback'] })

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(patchCall[1].body as string).enabled_clients).toContain('old-claude')
  })
})
