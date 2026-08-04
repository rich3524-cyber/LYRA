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

// Both must be set: AUTH0_DOMAIN feeds the issuer check, AUTH0_MCP_AUDIENCE
// feeds the audience check. Passing `audience: undefined` to jwtVerify skips
// the audience check entirely (jose treats it as "don't verify"), which
// would let a validly-signed token issued for a *different* API authenticate
// here -- so a missing env var must hard-fail, not silently degrade.
function assertAuth0EnvConfigured(): void {
  if (!process.env.AUTH0_DOMAIN) throw new Error('AUTH0_DOMAIN is not set')
  if (!process.env.AUTH0_MCP_AUDIENCE) throw new Error('AUTH0_MCP_AUDIENCE is not set')
}

export interface Auth0AccessTokenPayload {
  sub: string
  [key: string]: unknown
}

// jwks is injectable so tests can verify against a local key pair instead of
// Auth0's real, network-fetched JWKS endpoint -- see lib/jwt-verify.test.ts.
export async function verifyAuth0AccessToken(
  token: string,
  jwks?: JWTVerifyGetKey
): Promise<Auth0AccessTokenPayload | null> {
  try {
    assertAuth0EnvConfigured()
    const { payload } = await jwtVerify(token, jwks ?? getDefaultJwks(), {
      issuer:     `https://${process.env.AUTH0_DOMAIN}/`,
      audience:   process.env.AUTH0_MCP_AUDIENCE,
      algorithms: ['RS256'],
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    return payload as Auth0AccessTokenPayload
  } catch {
    return null
  }
}
