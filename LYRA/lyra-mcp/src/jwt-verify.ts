import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

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

// jose treats an `undefined` `audience` option as "skip the audience check" —
// it is not a no-op, it is a bypass. That's why AUTH0_MCP_AUDIENCE (and
// AUTH0_DOMAIN, which the issuer check is built from) must be verified as
// present *before* we ever call jwtVerify, and why any problem resolving
// config or keys must fail closed (return null) rather than throw or verify
// with a weakened check.
function assertAuth0EnvConfigured() {
  if (!process.env.AUTH0_DOMAIN) throw new Error('AUTH0_DOMAIN is not set')
  if (!process.env.AUTH0_MCP_AUDIENCE) throw new Error('AUTH0_MCP_AUDIENCE is not set')
}

export async function verifyAuth0AccessToken(
  token: string,
  jwks?: JWTVerifyGetKey
): Promise<Auth0AccessTokenPayload | null> {
  try {
    assertAuth0EnvConfigured()
    // Resolved inside the try block (not as a default-parameter expression)
    // so that a throw from getDefaultJwks() — e.g. `new URL()` rejecting a
    // malformed AUTH0_DOMAIN — is caught here and fails closed to null,
    // instead of escaping uncaught to callers that omit `jwks` (as the HTTP
    // middleware does).
    const resolvedJwks = jwks ?? getDefaultJwks()
    const { payload } = await jwtVerify(token, resolvedJwks, {
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      audience: process.env.AUTH0_MCP_AUDIENCE,
      algorithms: ['RS256'],
    })
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return payload as Auth0AccessTokenPayload
  } catch (err) {
    console.error('[verifyAuth0AccessToken] token verification failed:', err)
    return null
  }
}
