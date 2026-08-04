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
