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

function assertAuth0EnvConfigured() {
  if (!process.env.AUTH0_DOMAIN) throw new Error('AUTH0_DOMAIN is not set')
  if (!process.env.AUTH0_MCP_AUDIENCE) throw new Error('AUTH0_MCP_AUDIENCE is not set')
}

export async function verifyAuth0AccessToken(
  token: string,
  jwks: JWTVerifyGetKey = getDefaultJwks()
): Promise<Auth0AccessTokenPayload | null> {
  try {
    assertAuth0EnvConfigured()
    const { payload } = await jwtVerify(token, jwks, {
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
