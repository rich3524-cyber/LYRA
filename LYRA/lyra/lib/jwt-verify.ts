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
