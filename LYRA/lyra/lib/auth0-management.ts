// Talks to the Auth0 Management API to provision real Auth0 Applications on
// demand -- the only caller is the Dynamic Client Registration shim
// (app/api/oauth/register). A fresh Management API token is fetched per call
// rather than cached: DCR registration is expected to be rare (a new MCP
// client connecting for the first time), so the extra token round-trip per
// call is not worth the complexity of a cache with expiry tracking.

const TIMEOUT_MS = 20_000

interface Auth0TokenResponse {
  access_token: string
}

async function getManagementApiToken(): Promise<string> {
  const domain = process.env.AUTH0_DOMAIN!
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.AUTH0_MGMT_CLIENT_ID,
      client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
      audience:      `https://${domain}/api/v2/`,
      grant_type:    'client_credentials',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Auth0 Management API token request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as Auth0TokenResponse
  return data.access_token
}

export interface CreateAuth0ClientParams {
  name: string
  redirectUris: string[]
}

export interface Auth0ClientResult {
  client_id: string
  name: string
  callbacks: string[]
}

export async function createAuth0Client(params: CreateAuth0ClientParams): Promise<Auth0ClientResult> {
  const domain = process.env.AUTH0_DOMAIN!
  const token = await getManagementApiToken()

  const res = await fetch(`https://${domain}/api/v2/clients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
    // Public client (native app + PKCE): no client secret is issued, so
    // there's nothing for a leaked callback/redirect to expose. Refresh
    // token rotation is a per-Application setting in Auth0 (not settable
    // once on the API/Resource Server the way the token-expiration fields
    // are), so it must be requested explicitly for every client this shim
    // provisions -- leeway: 0 matches "Reuse Interval: 0" in the dashboard's
    // equivalent Application-level control.
    body: JSON.stringify({
      name:                       params.name,
      app_type:                   'native',
      token_endpoint_auth_method: 'none',
      grant_types:                ['authorization_code', 'refresh_token'],
      callbacks:                  params.redirectUris,
      jwt_configuration:          { alg: 'RS256' },
      refresh_token: {
        rotation_type:   'rotating',
        expiration_type: 'expiring',
        leeway:          0,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Auth0 Management API client creation failed: ${res.status} ${await res.text()}`)
  }
  return await res.json() as Auth0ClientResult
}
