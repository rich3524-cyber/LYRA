// app/api/oauth/register/route.ts
import { NextResponse } from 'next/server'
import { getOrCreateAuth0Client } from '@/lib/auth0-management'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const MAX_REDIRECT_URIS = 10
const MAX_STRING_LENGTH = 500

// RFC 7591 Dynamic Client Registration. Unauthenticated by design -- this is
// the entry point a not-yet-known OAuth client (e.g. Claude's MCP connector)
// uses to register itself before any user has consented to anything. It
// reuses an existing Auth0 Application when one already matches this exact
// (name, redirect_uris) pair, or provisions a real one via the Management
// API (lib/auth0-management.ts) as a public client (no secret, PKCE-only),
// scoped to authorization_code + refresh_token grants -- see
// docs/LYRA-mcp-server-design.md section 2.2. The reuse matters: this
// tenant has a small fixed cap on total Applications, and a naive
// always-create implementation previously exhausted it after a handful of
// reconnects.
export async function POST(req: Request) {
  // Unauthenticated + each call provisions a real, permanent Auth0
  // Application via two Management API round-trips -- cap per-IP so this
  // can't be used for abuse/cost amplification against the Auth0 tenant.
  // Registration is expected to be rare (a new MCP client connecting for
  // the first time), so a conservative limit matching klaviyo-subscribe's
  // is appropriate.
  const { allowed } = await checkRateLimit(`oauth-register:${getClientIp(req)}`, 5, 600)
  if (!allowed) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Too many registration requests, try again later' },
      { status: 429 }
    )
  }

  let body: { redirect_uris?: unknown; client_name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'Request body must be valid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Request body must be a JSON object' },
      { status: 400 }
    )
  }

  const redirectUris = body.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((u) => typeof u === 'string')) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris must be a non-empty array of strings' },
      { status: 400 }
    )
  }

  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: `redirect_uris must not exceed ${MAX_REDIRECT_URIS} entries` },
      { status: 400 }
    )
  }

  if (redirectUris.some((u) => u.length > MAX_STRING_LENGTH)) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: `Each redirect_uri must not exceed ${MAX_STRING_LENGTH} characters` },
      { status: 400 }
    )
  }

  if (typeof body.client_name === 'string' && body.client_name.length > MAX_STRING_LENGTH) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: `client_name must not exceed ${MAX_STRING_LENGTH} characters` },
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
    const client = await getOrCreateAuth0Client({ name: clientName, redirectUris })

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
