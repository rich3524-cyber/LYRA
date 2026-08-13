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

interface Auth0ClientListEntry {
  client_id: string
  name?: string
  callbacks?: string[]
  app_type?: string
}

function sameRedirectSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((uri, i) => uri === sortedB[i])
}

// Looks for a previously-registered Application matching this exact (name,
// redirect_uris) pair. Best-effort: a list failure returns null rather than
// throwing, so a transient Auth0 blip falls through to creating a new
// client (the previous, always-create behaviour) instead of hard-failing
// registration. Fetches one page (100) unfiltered by name/app_type -- Auth0's
// Management API has no server-side equality filter for either on this
// endpoint, and the tenant's own Application cap keeps the real count well
// under that page size.
async function findExistingAuth0Client(
  token: string,
  params: CreateAuth0ClientParams
): Promise<Auth0ClientResult | null> {
  const domain = process.env.AUTH0_DOMAIN!
  try {
    const res = await fetch(
      `https://${domain}/api/v2/clients?fields=client_id,name,callbacks,app_type&include_fields=true&per_page=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal:  AbortSignal.timeout(TIMEOUT_MS),
      }
    )
    if (!res.ok) {
      console.error(`Auth0 Management API client list failed: ${res.status} ${await res.text()}`)
      return null
    }
    const clients = (await res.json()) as Auth0ClientListEntry[]
    const match = clients.find(
      (c) => c.app_type === 'native' && c.name === params.name && sameRedirectSet(c.callbacks ?? [], params.redirectUris)
    )
    return match ? { client_id: match.client_id, name: match.name ?? params.name, callbacks: match.callbacks ?? [] } : null
  } catch (err) {
    console.error('Auth0 Management API client list threw:', err)
    return null
  }
}

async function createAuth0ClientWithToken(token: string, params: CreateAuth0ClientParams): Promise<Auth0ClientResult> {
  const domain = process.env.AUTH0_DOMAIN!

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
      name:                       `[DCR] ${params.name}`,
      app_type:                   'native',
      // Force the consent prompt for every dynamically-registered client.
      // Auth0 defaults new Applications to first-party, and first-party
      // clients can skip consent when the target API allows it -- since this
      // shim provisions a client for an arbitrary, unauthenticated caller,
      // silently skipping consent would let a phished login link redirect
      // straight to token issuance with no visible step for the user to
      // notice or decline.
      is_first_party:             false,
      token_endpoint_auth_method: 'none',
      grant_types:                ['authorization_code', 'refresh_token'],
      callbacks:                  params.redirectUris,
      jwt_configuration:          { alg: 'RS256' },
      // Auth0's Management API rejects refresh_token.rotation_type:
      // 'rotating' with a 400 ("Application must be OIDC Conformant when
      // Refresh Token rotation is enabled") unless oidc_conformant is
      // explicitly set -- confirmed live against the real tenant.
      oidc_conformant: true,
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

// Always provisions a fresh Application. Kept as its own export for callers
// that genuinely want a new client every time; getOrCreateAuth0Client below
// is what the DCR route uses.
export async function createAuth0Client(params: CreateAuth0ClientParams): Promise<Auth0ClientResult> {
  const token = await getManagementApiToken()
  return createAuth0ClientWithToken(token, params)
}

// RFC 7591 registration identifies a piece of client software, not an
// individual end-user or device -- OAuth's own client_id model already works
// this way. Minting a brand-new, permanent Auth0 Application on every
// registration call meant every reconnect that lost its stored client_id (a
// new device, a cleared cache, the MCP client re-registering after an
// update) burned one more slot forever, on a tenant with a small fixed cap
// on total Applications -- confirmed live: 4 duplicate "Claude" Applications
// existed from repeat registrations before this tenant's Application limit
// was hit. Reusing an existing Application when the same (name,
// redirect_uris) pair registers again stops that leak: two genuinely
// different client apps would need to send both the same name and the same
// full redirect_uris set to collide, which is what "the same software"
// means in this context.
export async function getOrCreateAuth0Client(params: CreateAuth0ClientParams): Promise<Auth0ClientResult> {
  const token = await getManagementApiToken()
  const existing = await findExistingAuth0Client(token, params)
  if (existing) return existing
  return createAuth0ClientWithToken(token, params)
}
