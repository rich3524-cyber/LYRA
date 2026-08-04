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
