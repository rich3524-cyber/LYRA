// app/.well-known/oauth-authorization-server/route.ts
import { NextResponse } from 'next/server'

// RFC 8414. Auth0 is the real authorization server (docs/LYRA-mcp-server-design.md
// section 2.2) -- this document just tells a connector where to find it, plus
// where to find LYRA's own Dynamic Client Registration shim (Task 5). The six
// LYRA-specific scopes here match docs/LYRA-mcp-server-design.md section 3.3
// exactly -- keep them in sync if that list ever changes.
//
// `issuer` is set to APP_BASE_URL (where this document is actually served),
// not Auth0's domain -- RFC 8414 §3.3 requires a client fetching this exact
// URL to see an `issuer` value it's self-consistent with, and a strict
// client (confirmed live: MCP Inspector) rejects the document otherwise.
// This is independent of bearer-token validation: lib/jwt-verify.ts checks
// a token's real `iss` claim against AUTH0_DOMAIN directly (hardcoded, not
// derived from this document at runtime), since Auth0 -- not this endpoint
// -- is what actually signs and issues the tokens. The two concerns
// (metadata self-consistency for discovery vs. real token issuer identity
// for cryptographic validation) are allowed to differ.
export async function GET() {
  const authDomain = process.env.AUTH0_DOMAIN
  const appBaseUrl = process.env.APP_BASE_URL

  return NextResponse.json(
    {
      issuer:                                appBaseUrl,
      authorization_endpoint:                `https://${authDomain}/authorize`,
      token_endpoint:                        `https://${authDomain}/oauth/token`,
      registration_endpoint:                 `${appBaseUrl}/api/oauth/register`,
      jwks_uri:                              `https://${authDomain}/.well-known/jwks.json`,
      response_types_supported:              ['code'],
      grant_types_supported:                 ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported:      ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      // offline_access is what actually makes Auth0 issue a refresh token
      // during the authorize call -- grant_types_supported above already
      // lists 'refresh_token' and the DCR shim (app/api/oauth/register)
      // provisions clients with rotating refresh tokens, but neither of
      // those matters unless the client's own authorization request
      // includes this scope. A connector that builds its consent request
      // from this exact list (the common case) would otherwise never ask
      // for one, get only a short-lived access token, and need a full
      // manual reconnect once it expires instead of a silent refresh.
      scopes_supported: [
        'openid', 'profile', 'email', 'offline_access',
        'workspaces:read', 'content:read', 'content:write',
        'inbox:respond', 'settings:write', 'reports:read',
      ],
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  )
}
