# LYRA MCP Server — Phase 0 (OAuth Authorization Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Claude MCP connector complete a full OAuth 2.1 + PKCE authorization flow against LYRA, ending with a bearer token that LYRA's existing API accepts as an authenticated user — without touching any of LYRA's existing session-cookie web login.

**Architecture:** Auth0 (already used for LYRA's own login) acts as the OAuth 2.1 authorization server and token issuer — no custom AS is built. LYRA adds three small, focused pieces: a Dynamic Client Registration (RFC 7591) shim that provisions real Auth0 Applications on demand via the Management API, an OAuth Authorization Server metadata document (RFC 8414) so a connector can discover the flow, and a second, additive bearer-token verification path alongside `lib/auth.ts`'s existing Auth0 session-cookie check — so every one of LYRA's ~66 existing API routes gains bearer-token support for free, with zero per-route changes.

**Tech Stack:** Next.js 16 App Router route handlers, `jose` (new dependency) for JWKS-based JWT verification, Auth0 Management API (client-credentials M2M app) for dynamic client provisioning, Prisma/Postgres for the existing `User` model (unchanged schema).

**Out of scope for this plan** (see `docs/LYRA-mcp-server-design.md` Phase 1+): the `lyra-mcp` gateway service itself, MCP tools, the capability registry. This plan's exit criteria is that the auth mechanics work correctly end-to-end when tested directly (curl / Playwright against Auth0's real Universal Login) — full verification with the actual Claude connector requires the Phase 1 gateway to exist too, since that's where the connector points.

---

## Before you start

Read `docs/LYRA-mcp-server-design.md` sections 2.2 and 2.3 in full — they contain the architectural reasoning this plan implements. Read `lib/auth.ts` and `lib/auth0.ts` as they exist today; Task 3 modifies `lib/auth.ts` and needs to preserve every line of its existing behavior exactly.

---

### Task 1: Auth0 dashboard configuration + environment variables

**Files:**
- Modify: `.env.local` (not committed — gitignored)
- Modify: `.env.example`
- Modify: `README.md` (env var table)

This task has no code — it's Auth0 tenant configuration, done once, by hand, in the Auth0 dashboard. Every later task depends on the resulting values.

- [ ] **Step 1: Create a new Auth0 API (Resource Server)**

In the Auth0 dashboard: **Applications → APIs → Create API**.
- Name: `LYRA MCP API`
- Identifier (this becomes the `audience`): `https://mcp.lyraonline.ai`
- Signing Algorithm: `RS256`

After creation, open the new API's **Settings** tab:
- Toggle **Allow Offline Access** on (required for refresh tokens to be issued against this audience)
- Under **Access Settings**, note the identifier value exactly as entered — it is used verbatim as `AUTH0_MCP_AUDIENCE` below.

Under the API's **Settings → Token Expiration**: set Token Expiration to `3600` seconds (60 minutes), matching the design spec.

- [ ] **Step 2: Enable refresh token rotation for this API**

Still on the API's settings, under **Refresh Token Behavior**: set Rotation to **Rotating**, and Reuse Interval to `0`.

- [ ] **Step 3: Create the Management API M2M application for the DCR shim**

**Applications → Create Application → Machine to Machine Application.**
- Name: `LYRA MCP — DCR Shim`
- Authorize it for: **Auth0 Management API**
- Grant exactly these scopes (search and check each): `create:clients`, `read:clients`

Do not grant any other scope. This application's credentials are held only by the DCR shim (Task 5) and nothing else — the point of a dedicated M2M app is that if these credentials leak, the blast radius is "can create Auth0 applications," not "can read/modify users, connections, or anything else in the tenant."

After creation, open the application's **Settings** tab and copy the **Client ID** and **Client Secret**.

- [ ] **Step 4: Add the new environment variables**

Add to `.env.local` (real values from Steps 1 and 3 — this file is gitignored, never commit real secrets):

```
AUTH0_MCP_AUDIENCE="https://mcp.lyraonline.ai"
AUTH0_MGMT_CLIENT_ID="<Client ID from Step 3>"
AUTH0_MGMT_CLIENT_SECRET="<Client Secret from Step 3>"
```

Add the same three variable *names* (no values) to `.env.example`, in the Auth0 section, immediately after the existing `AUTH0_SECRET` line:

```
AUTH0_SECRET=

# MCP OAuth layer (see docs/LYRA-mcp-server-design.md)
AUTH0_MCP_AUDIENCE=
AUTH0_MGMT_CLIENT_ID=
AUTH0_MGMT_CLIENT_SECRET=
```

- [ ] **Step 5: Document the new variables in `README.md`**

In the "Required environment variables" table, add three rows immediately after the existing `AUTH0_SECRET` row:

```
| `AUTH0_MCP_AUDIENCE` | Identifier of the "LYRA MCP API" Auth0 Resource Server — the OAuth audience MCP access tokens are issued for |
| `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET` | Dedicated Auth0 M2M application, scoped only to `create:clients`/`read:clients` on the Management API — used solely by the Dynamic Client Registration shim (`app/api/oauth/register`) |
```

- [ ] **Step 6: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document new Auth0 MCP OAuth environment variables"
```

(`.env.local` is gitignored and never staged.)

---

### Task 2: Auth0 Management API client

**Files:**
- Create: `lib/auth0-management.ts`
- Test: `lib/auth0-management.test.ts`

This is the only piece of code that talks to the Auth0 Management API. It exists purely to let the DCR shim (Task 5) provision real Auth0 Applications.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/auth0-management.test.ts
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

    // First call: token request
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://test-tenant.auth0.com/oauth/token')
    const tokenBody = JSON.parse(tokenInit.body as string)
    expect(tokenBody).toEqual({
      client_id: 'mgmt-client-id',
      client_secret: 'mgmt-client-secret',
      audience: 'https://test-tenant.auth0.com/api/v2/',
      grant_type: 'client_credentials',
    })

    // Second call: client creation, authenticated with the token from the first call
    const [clientUrl, clientInit] = fetchMock.mock.calls[1]
    expect(clientUrl).toBe('https://test-tenant.auth0.com/api/v2/clients')
    expect((clientInit.headers as Record<string, string>).Authorization).toBe('Bearer mgmt-token-abc')
    const clientBody = JSON.parse(clientInit.body as string)
    expect(clientBody).toEqual({
      name: 'Claude',
      app_type: 'native',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      callbacks: ['https://claude.ai/callback'],
      jwt_configuration: { alg: 'RS256' },
    })
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run lib/auth0-management.test.ts
```

Expected: `FAIL` — `lib/auth0-management.ts` does not exist yet (`Cannot find module './auth0-management'`).

- [ ] **Step 3: Write the implementation**

```typescript
// lib/auth0-management.ts

// Talks to the Auth0 Management API to provision real Auth0 Applications on
// demand -- the only caller is the Dynamic Client Registration shim
// (app/api/oauth/register). A fresh Management API token is fetched per call
// rather than cached: DCR registration is expected to be rare (a new MCP
// client connecting for the first time), so the extra token round-trip per
// call is not worth the complexity of a cache with expiry tracking.

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
    body: JSON.stringify({
      name:                       params.name,
      app_type:                   'native',
      token_endpoint_auth_method: 'none',
      grant_types:                ['authorization_code', 'refresh_token'],
      callbacks:                  params.redirectUris,
      jwt_configuration:          { alg: 'RS256' },
    }),
  })
  if (!res.ok) {
    throw new Error(`Auth0 Management API client creation failed: ${res.status} ${await res.text()}`)
  }
  return await res.json() as Auth0ClientResult
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run lib/auth0-management.test.ts
```

Expected: `PASS` — 3 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/auth0-management.ts lib/auth0-management.test.ts
git commit -m "feat: add Auth0 Management API client for dynamic client provisioning"
```

---

### Task 3: JWT bearer-token verification

**Files:**
- Create: `lib/jwt-verify.ts`
- Test: `lib/jwt-verify.test.ts`
- Modify: `package.json` (add `jose` dependency)

- [ ] **Step 1: Add the `jose` dependency**

```bash
npm install jose
```

Confirm it landed in `dependencies` (not `devDependencies`) in `package.json` — it's used in production request-handling code, not just tests.

- [ ] **Step 2: Write the failing tests**

```typescript
// lib/jwt-verify.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from 'jose'
import { verifyAuth0AccessToken } from './jwt-verify'

const originalEnv = { ...process.env }
let privateKey: CryptoKey
let testJwks: JWTVerifyGetKey

beforeEach(async () => {
  process.env.AUTH0_DOMAIN = 'test-tenant.auth0.com'
  process.env.AUTH0_MCP_AUDIENCE = 'https://mcp.lyraonline.ai'

  const { publicKey, privateKey: priv } = await generateKeyPair('RS256')
  privateKey = priv
  const jwk = await exportJWK(publicKey)
  testJwks = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] })
})

afterEach(() => {
  process.env = { ...originalEnv }
})

async function signTestToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ sub: 'auth0|user123', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuedAt()
    .setIssuer('https://test-tenant.auth0.com/')
    .setAudience('https://mcp.lyraonline.ai')
    .setExpirationTime('1h')
    .sign(privateKey)
}

describe('verifyAuth0AccessToken', () => {
  it('returns the payload for a validly-signed token with correct issuer and audience', async () => {
    const token = await signTestToken()
    const payload = await verifyAuth0AccessToken(token, testJwks)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('auth0|user123')
  })

  it('returns null for a token signed with the wrong key', async () => {
    const { privateKey: wrongKey } = await generateKeyPair('RS256')
    const token = await new SignJWT({ sub: 'auth0|user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer('https://test-tenant.auth0.com/')
      .setAudience('https://mcp.lyraonline.ai')
      .setExpirationTime('1h')
      .sign(wrongKey)

    expect(await verifyAuth0AccessToken(token, testJwks)).toBeNull()
  })

  it('returns null for the wrong issuer', async () => {
    const token = await new SignJWT({ sub: 'auth0|user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer('https://attacker.example.com/')
      .setAudience('https://mcp.lyraonline.ai')
      .setExpirationTime('1h')
      .sign(privateKey)

    expect(await verifyAuth0AccessToken(token, testJwks)).toBeNull()
  })

  it('returns null for the wrong audience', async () => {
    const token = await new SignJWT({ sub: 'auth0|user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer('https://test-tenant.auth0.com/')
      .setAudience('https://some-other-api.example.com')
      .setExpirationTime('1h')
      .sign(privateKey)

    expect(await verifyAuth0AccessToken(token, testJwks)).toBeNull()
  })

  it('returns null for an expired token', async () => {
    const token = await new SignJWT({ sub: 'auth0|user123' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer('https://test-tenant.auth0.com/')
      .setAudience('https://mcp.lyraonline.ai')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey)

    expect(await verifyAuth0AccessToken(token, testJwks)).toBeNull()
  })

  it('returns null for a token with no sub claim', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer('https://test-tenant.auth0.com/')
      .setAudience('https://mcp.lyraonline.ai')
      .setExpirationTime('1h')
      .sign(privateKey)

    expect(await verifyAuth0AccessToken(token, testJwks)).toBeNull()
  })

  it('returns null for a malformed token string without throwing', async () => {
    await expect(verifyAuth0AccessToken('not-a-jwt', testJwks)).resolves.toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run lib/jwt-verify.test.ts
```

Expected: `FAIL` — `lib/jwt-verify.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

```typescript
// lib/jwt-verify.ts
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

// Lazy so a missing AUTH0_DOMAIN at import time doesn't crash module load --
// mirrors lib/stripe.ts's getStripe()/Proxy pattern for the same reason.
let _defaultJwks: JWTVerifyGetKey | null = null
function getDefaultJwks(): JWTVerifyGetKey {
  if (!_defaultJwks) {
    _defaultJwks = createRemoteJWKSet(new URL(`https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`))
  }
  return _defaultJwks
}

export interface Auth0AccessTokenPayload {
  sub: string
  [key: string]: unknown
}

// jwks is injectable so tests can verify against a local key pair instead of
// Auth0's real, network-fetched JWKS endpoint -- see lib/jwt-verify.test.ts.
export async function verifyAuth0AccessToken(
  token: string,
  jwks: JWTVerifyGetKey = getDefaultJwks()
): Promise<Auth0AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer:   `https://${process.env.AUTH0_DOMAIN}/`,
      audience: process.env.AUTH0_MCP_AUDIENCE,
    })
    if (typeof payload.sub !== 'string') return null
    return payload as Auth0AccessTokenPayload
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run lib/jwt-verify.test.ts
```

Expected: `PASS` — 7 tests.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/jwt-verify.ts lib/jwt-verify.test.ts package.json package-lock.json
git commit -m "feat: add JWKS-based Auth0 access token verification"
```

---

### Task 4: Additive bearer-token path in `lib/auth.ts`

**Files:**
- Modify: `lib/auth.ts`
- Test: `lib/auth.test.ts`

This is the task that makes every existing LYRA API route accept a bearer token for free, with no other file changed. Read the existing `lib/auth.ts` in full before starting (reproduced in the Before You Start section) — every line of its current behavior must be preserved exactly for the session-cookie path.

- [ ] **Step 1: Write the failing tests**

Only the new, extracted `getUserFromBearerToken` function is unit-tested directly — `getCurrentUser` itself is a `cache()`-wrapped function reading `next/headers` and is exercised indirectly through this extracted function, matching how the rest of this codebase tests worker/route logic (extract the testable core, keep the wrapper thin).

```typescript
// lib/auth.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getUserFromBearerToken } from './auth'

describe('getUserFromBearerToken', () => {
  it('returns null when there is no Authorization header', async () => {
    const result = await getUserFromBearerToken(null, {
      verifyToken: vi.fn(),
      prisma: { user: { findUnique: vi.fn() } },
    })
    expect(result).toBeNull()
  })

  it('returns null when the Authorization header is not a Bearer token', async () => {
    const result = await getUserFromBearerToken('Basic dXNlcjpwYXNz', {
      verifyToken: vi.fn(),
      prisma: { user: { findUnique: vi.fn() } },
    })
    expect(result).toBeNull()
  })

  it('returns null when the token fails verification', async () => {
    const verifyToken = vi.fn().mockResolvedValue(null)
    const result = await getUserFromBearerToken('Bearer bad-token', {
      verifyToken,
      prisma: { user: { findUnique: vi.fn() } },
    })
    expect(result).toBeNull()
    expect(verifyToken).toHaveBeenCalledWith('bad-token')
  })

  it('looks up the user by auth0Id from the verified token sub claim and returns it', async () => {
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'auth0|user123' })
    const findUnique = vi.fn().mockResolvedValue({ id: 'u1', auth0Id: 'auth0|user123', email: 'a@b.com' })
    const result = await getUserFromBearerToken('Bearer good-token', {
      verifyToken,
      prisma: { user: { findUnique } },
    })
    expect(result).toEqual({ id: 'u1', auth0Id: 'auth0|user123', email: 'a@b.com' })
    expect(findUnique).toHaveBeenCalledWith({
      where: { auth0Id: 'auth0|user123' },
      include: { agency: true, workspaceAccess: { include: { workspace: true } } },
    })
  })

  it('returns null (does not create a user) when the verified token has no matching LYRA user', async () => {
    // Deliberate: a bearer token can only authenticate as a user who already
    // exists in LYRA (i.e. has logged into the web app at least once and has
    // a WorkspaceAccess row). Auto-provisioning a new blank User from an
    // MCP-only identity would let anyone with a valid Auth0 login silently
    // acquire a LYRA account with no workspace access checks anywhere else
    // in the app ever having run.
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'auth0|unknown-user' })
    const findUnique = vi.fn().mockResolvedValue(null)
    const result = await getUserFromBearerToken('Bearer good-token', {
      verifyToken,
      prisma: { user: { findUnique } },
    })
    expect(result).toBeNull()
  })

  it('returns null and logs when the database lookup throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'auth0|user123' })
    const findUnique = vi.fn().mockRejectedValue(new Error('db down'))
    const result = await getUserFromBearerToken('Bearer good-token', {
      verifyToken,
      prisma: { user: { findUnique } },
    })
    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run lib/auth.test.ts
```

Expected: `FAIL` — `getUserFromBearerToken` is not exported from `./auth` yet.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `lib/auth.ts` with:

```typescript
// lib/auth.ts
import { timingSafeEqual } from 'crypto'
import { cache } from 'react'
import { headers } from 'next/headers'
import { auth0 } from './auth0'
import { prisma } from './prisma'
import { verifyAuth0AccessToken } from './jwt-verify'

interface BearerAuthDeps {
  verifyToken: typeof verifyAuth0AccessToken
  prisma: { user: { findUnique: typeof prisma.user.findUnique } }
}

const defaultBearerAuthDeps: BearerAuthDeps = { verifyToken: verifyAuth0AccessToken, prisma }

// Additive bearer-token auth path for MCP (and any future API-token) clients,
// sitting alongside -- never replacing -- the Auth0 session-cookie path
// below. A request with no Authorization header (every existing web-app
// request) falls straight through with zero behavior change.
//
// Deliberately findUnique, not upsert: a bearer token can only authenticate
// as a user who already exists in LYRA (has a real WorkspaceAccess row from
// having used the web app at least once). See the "does not create a user"
// test case for why silently provisioning a blank user here would be unsafe.
export async function getUserFromBearerToken(
  authHeader: string | null,
  deps: BearerAuthDeps = defaultBearerAuthDeps
) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length)

  const payload = await deps.verifyToken(token)
  if (!payload) return null

  try {
    return await deps.prisma.user.findUnique({
      where: { auth0Id: payload.sub },
      include: {
        agency: true,
        workspaceAccess: { include: { workspace: true } },
      },
    })
  } catch (err) {
    console.error('[getUserFromBearerToken] prisma.user.findUnique failed:', err)
    return null
  }
}

export const getCurrentUser = cache(async () => {
  const hdrs = await headers()
  const bearerUser = await getUserFromBearerToken(hdrs.get('authorization'))
  if (bearerUser) return bearerUser

  let session: Awaited<ReturnType<typeof auth0.getSession>>
  try {
    session = await auth0.getSession()
  } catch (err) {
    console.error('[getCurrentUser] auth0.getSession failed:', err)
    return null
  }
  if (!session?.user) return null

  const { sub, email, name, picture } = session.user

  try {
    return await prisma.user.upsert({
      where: { auth0Id: sub },
      create: {
        auth0Id: sub,
        email:   email ?? '',
        name:    name  ?? null,
        avatarUrl: picture ?? null,
      },
      update: {
        email:     email ?? undefined,
        name:      name  ?? undefined,
        avatarUrl: picture ?? undefined,
      },
      include: {
        agency: true,
        workspaceAccess: { include: { workspace: true } },
      },
    })
  } catch (err) {
    console.error('[getCurrentUser] prisma.user.upsert failed:', err)
    return null
  }
})

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

// Single source of truth for cron-route auth -- previously duplicated (correctly,
// timing-safe) across 4 separate cron route files, while this exported version
// was the one nobody imported and used a timing-unsafe `===` comparison. Fixed
// and consolidated 18 Jul 2026 so there's only one implementation to get right.
export function checkCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (auth.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run lib/auth.test.ts
```

Expected: `PASS` — 6 tests.

- [ ] **Step 5: Full typecheck and full test suite**

```bash
npx tsc --noEmit
npm test
```

Expected: both clean. The full suite matters here specifically — `lib/auth.ts` is imported by nearly every API route in the app (`requireAuth()`), so this is the highest-blast-radius change in this plan. If anything else broke, it will show up here.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat: add additive bearer-token auth path to lib/auth.ts for MCP clients"
```

---

### Task 5: Dynamic Client Registration shim

**Files:**
- Create: `app/api/oauth/register/route.ts`
- Test: `app/api/oauth/register/route.test.ts`

Implements RFC 7591 registration. This is the endpoint the design spec's `registration_endpoint` (Task 6) points at.

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run app/api/oauth/register/route.test.ts
```

Expected: `FAIL` — `app/api/oauth/register/route.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/oauth/register/route.ts
import { NextResponse } from 'next/server'
import { createAuth0Client } from '@/lib/auth0-management'

// RFC 7591 Dynamic Client Registration. Unauthenticated by design -- this is
// the entry point a not-yet-known OAuth client (e.g. Claude's MCP connector)
// uses to register itself before any user has consented to anything. It
// provisions a real Auth0 Application via the Management API (lib/auth0-management.ts)
// as a public client (no secret, PKCE-only), scoped to authorization_code +
// refresh_token grants -- see docs/LYRA-mcp-server-design.md section 2.2.
export async function POST(req: Request) {
  let body: { redirect_uris?: unknown; client_name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'Request body must be valid JSON' }, { status: 400 })
  }

  const redirectUris = body.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((u) => typeof u === 'string')) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris must be a non-empty array of strings' },
      { status: 400 }
    )
  }

  for (const uri of redirectUris) {
    let parsed: URL
    try {
      parsed = new URL(uri)
    } catch {
      return NextResponse.json({ error: 'invalid_redirect_uri', error_description: `Not a valid URL: ${uri}` }, { status: 400 })
    }
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
      return NextResponse.json(
        { error: 'invalid_redirect_uri', error_description: `redirect_uris must use https (http allowed only for localhost): ${uri}` },
        { status: 400 }
      )
    }
  }

  const clientName = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim() : 'MCP Client'

  try {
    const client = await createAuth0Client({ name: clientName, redirectUris })

    return NextResponse.json(
      {
        client_id:                     client.client_id,
        client_id_issued_at:           Math.floor(Date.now() / 1000),
        client_name:                   clientName,
        redirect_uris:                 redirectUris,
        token_endpoint_auth_method:    'none',
        grant_types:                   ['authorization_code', 'refresh_token'],
        response_types:                ['code'],
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('POST /api/oauth/register error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/oauth/register/route.test.ts
```

Expected: `PASS` — 8 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/oauth/register/route.ts app/api/oauth/register/route.test.ts
git commit -m "feat: add RFC 7591 Dynamic Client Registration shim for MCP clients"
```

---

### Task 6: OAuth Authorization Server metadata endpoint

**Files:**
- Create: `app/.well-known/oauth-authorization-server/route.ts`
- Test: `app/.well-known/oauth-authorization-server/route.test.ts`

RFC 8414 discovery document. This is how an MCP client finds the authorize/token/registration endpoints without any of them being hardcoded on the client side.

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run app/.well-known/oauth-authorization-server/route.test.ts
```

Expected: `FAIL` — the route does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// app/.well-known/oauth-authorization-server/route.ts
import { NextResponse } from 'next/server'

// RFC 8414. Auth0 is the real authorization server (docs/LYRA-mcp-server-design.md
// section 2.2) -- this document just tells a connector where to find it, plus
// where to find LYRA's own Dynamic Client Registration shim (Task 5). The six
// LYRA-specific scopes here match docs/LYRA-mcp-server-design.md section 3.3
// exactly -- keep them in sync if that list ever changes.
export async function GET() {
  const authDomain = process.env.AUTH0_DOMAIN
  const appBaseUrl = process.env.APP_BASE_URL

  return NextResponse.json(
    {
      issuer:                                `https://${authDomain}/`,
      authorization_endpoint:                `https://${authDomain}/authorize`,
      token_endpoint:                        `https://${authDomain}/oauth/token`,
      registration_endpoint:                 `${appBaseUrl}/api/oauth/register`,
      jwks_uri:                              `https://${authDomain}/.well-known/jwks.json`,
      response_types_supported:              ['code'],
      grant_types_supported:                 ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported:      ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [
        'openid', 'profile', 'email',
        'workspaces:read', 'content:read', 'content:write',
        'inbox:respond', 'settings:write', 'reports:read',
      ],
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run app/.well-known/oauth-authorization-server/route.test.ts
```

Expected: `PASS` — 2 tests.

- [ ] **Step 5: Typecheck and full suite**

```bash
npx tsc --noEmit
npm test
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add "app/.well-known/oauth-authorization-server/route.ts" "app/.well-known/oauth-authorization-server/route.test.ts"
git commit -m "feat: add RFC 8414 OAuth authorization server metadata endpoint"
```

---

### Task 7: End-to-end verification against real Auth0

**Files:**
- Create: `scripts/verify-mcp-oauth-flow.mjs` (throwaway verification script, not part of the app — do not import it from application code)

This is the one part of Phase 0 that cannot be unit-tested, because it exercises the real Auth0 tenant configured by hand in Task 1. It proves the dashboard configuration is actually correct, which nothing else in this plan verifies.

- [ ] **Step 1: Create a test user in the Auth0 dashboard**

**User Management → Users → Create User.** Use a throwaway email (e.g. `mcp-e2e-test@lyraonline.ai`) and a password you'll type once manually in Step 3.

In LYRA's own database, this user needs a real `WorkspaceAccess` row to pass Task 4's `findUnique` check. The simplest path: log into the LYRA web app once as this test user (completing LYRA's normal signup/onboarding) so `getCurrentUser()`'s existing session-cookie path creates the `User` row and workspace access the normal way. Do this before continuing.

- [ ] **Step 2: Write the verification script**

```javascript
// scripts/verify-mcp-oauth-flow.mjs
// One-shot manual verification that Task 1's Auth0 dashboard config, and
// Tasks 4-6's code, work together end-to-end. Not automated (Step 3 below
// requires a human to complete Auth0's login form) -- this is the intended
// exception to this plan's otherwise-automated testing, because dashboard
// configuration cannot be unit tested from application code.
//
// Run with: node scripts/verify-mcp-oauth-flow.mjs
// Requires: APP_BASE_URL, AUTH0_DOMAIN set in the environment (same values
// the running app uses).

import { createHash, randomBytes } from 'crypto'
import { createServer } from 'http'

const APP_BASE_URL = process.env.APP_BASE_URL
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
if (!APP_BASE_URL || !AUTH0_DOMAIN) {
  console.error('Set APP_BASE_URL and AUTH0_DOMAIN before running this script.')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:8734/callback'

console.log('1. Fetching OAuth metadata...')
const metadata = await fetch(`${APP_BASE_URL}/.well-known/oauth-authorization-server`).then((r) => r.json())
console.log('   OK:', metadata.issuer)

console.log('2. Registering a client via the DCR shim...')
const registration = await fetch(metadata.registration_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'MCP E2E Verification Script' }),
}).then((r) => r.json())
if (!registration.client_id) {
  console.error('   FAILED:', registration)
  process.exit(1)
}
console.log('   OK, client_id:', registration.client_id)

console.log('3. Open this URL in a browser and log in as your Auth0 test user:')
const codeVerifier = randomBytes(32).toString('base64url')
const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
const state = randomBytes(16).toString('hex')

const authorizeUrl = new URL(metadata.authorization_endpoint)
authorizeUrl.searchParams.set('response_type', 'code')
authorizeUrl.searchParams.set('client_id', registration.client_id)
authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authorizeUrl.searchParams.set('scope', 'openid profile email workspaces:read content:read')
authorizeUrl.searchParams.set('audience', process.env.AUTH0_MCP_AUDIENCE ?? 'https://mcp.lyraonline.ai')
authorizeUrl.searchParams.set('state', state)
authorizeUrl.searchParams.set('code_challenge', codeChallenge)
authorizeUrl.searchParams.set('code_challenge_method', 'S256')

console.log('   ' + authorizeUrl.toString())

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI)
    const returnedState = url.searchParams.get('state')
    const returnedCode = url.searchParams.get('code')
    res.end('You can close this tab and return to the terminal.')
    server.close()
    if (returnedState !== state) {
      reject(new Error('state mismatch -- possible CSRF or stale request'))
    } else if (!returnedCode) {
      reject(new Error('no code in callback: ' + url.search))
    } else {
      resolve(returnedCode)
    }
  })
  server.listen(8734)
  console.log('   Waiting for the callback on http://localhost:8734/callback ...')
})
console.log('4. Got authorization code.')

console.log('5. Exchanging code for tokens...')
const tokenResponse = await fetch(metadata.token_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type:    'authorization_code',
    client_id:     registration.client_id,
    code,
    redirect_uri:  REDIRECT_URI,
    code_verifier: codeVerifier,
  }),
}).then((r) => r.json())
if (!tokenResponse.access_token) {
  console.error('   FAILED:', tokenResponse)
  process.exit(1)
}
console.log('   OK, got access_token (expires in', tokenResponse.expires_in, 's)')

console.log('6. Calling a real LYRA API route with the bearer token...')
const apiResponse = await fetch(`${APP_BASE_URL}/api/workspaces`, {
  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
})
const workspaces = await apiResponse.json()
if (apiResponse.status !== 200) {
  console.error('   FAILED:', apiResponse.status, workspaces)
  process.exit(1)
}
console.log('   OK, status 200, workspaces:', JSON.stringify(workspaces))

console.log('\nAll steps passed. Phase 0 auth mechanics are verified against the real Auth0 tenant.')
```

- [ ] **Step 2: Run it against a local dev server**

In one terminal: `npm run dev`. In another:

```bash
node scripts/verify-mcp-oauth-flow.mjs
```

Expected: the script prints a URL, you open it, log in as the Task 1 test user, approve consent, and the script prints `All steps passed.` If any step fails, the script exits non-zero with the failing response body printed — fix the corresponding task before re-running.

- [ ] **Step 3: Delete the script**

This script exists only to prove Task 1's dashboard configuration works; it has no ongoing purpose once verified and should not linger as unmaintained scratch code in the repo (matching this project's established convention against committing throwaway `tmp-*` scripts — see `scripts/` for examples of what NOT to leave behind).

```bash
rm scripts/verify-mcp-oauth-flow.mjs
```

Do not commit this step separately — there is nothing to commit once the file is deleted and never staged.

---

## Self-Review

**Spec coverage** (against `docs/LYRA-mcp-server-design.md` section 2.2/2.3):
- Authorization code flow with PKCE → Task 1 (Auth0 config) + Task 7 (verified end-to-end)
- Access tokens, scoped, 60 min → Task 1 Step 1
- Refresh tokens with rotation → Task 1 Step 2
- Consent screen → Auth0 Universal Login, no LYRA code needed (informational note only, per the spec's confirmed 2026-08-04 clarification)
- Dynamic Client Registration shim → Task 5
- LYRA API additive bearer auth → Task 4
- OAuth discovery/metadata (needed for the DCR shim to be discoverable, and for the exit criteria to be testable at all) → Task 6

**Placeholder scan:** none found — every code block is complete and every task has concrete pass/fail expectations.

**Type consistency:** `getUserFromBearerToken`'s signature (`authHeader: string | null, deps: BearerAuthDeps`) is defined once in Task 4 and used identically in its own tests; `createAuth0Client`'s `CreateAuth0ClientParams`/`Auth0ClientResult` types from Task 2 are the exact shape Task 5's route handler and tests consume; `verifyAuth0AccessToken`'s injectable `jwks` parameter from Task 3 matches how Task 4's `BearerAuthDeps.verifyToken` is typed (`typeof verifyAuth0AccessToken`, so any signature drift between the two is a compile error, not a silent bug).
