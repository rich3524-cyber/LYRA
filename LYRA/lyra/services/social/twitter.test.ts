import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// twitter.ts stores the PKCE code_verifier in Redis instead of the client-visible
// `state` param -- stub redisClient with an in-memory map so the test doesn't need
// a real Redis instance, matching the vi.mock('@/lib/redis', ...) pattern used
// elsewhere (e.g. workers/post-publisher.worker.test.ts) to avoid real Redis I/O.
const { redisStore, mockRedisClient } = vi.hoisted(() => {
  const redisStore = new Map<string, string>()
  const mockRedisClient = {
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value)
      return 'OK'
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key)
    }),
  }
  return { redisStore, mockRedisClient }
})
vi.mock('@/lib/redis', () => ({ redisClient: mockRedisClient }))

process.env.TWITTER_CLIENT_ID = 'test-client-id'
process.env.APP_BASE_URL = 'https://app.test'

import { getAuthUrl, consumeCodeVerifier } from './twitter'

describe('twitter getAuthUrl PKCE handling', () => {
  beforeEach(() => {
    redisStore.clear()
    vi.clearAllMocks()
  })

  it('does not embed codeVerifier anywhere in the signed state payload', async () => {
    const { url } = await getAuthUrl('ws_123')
    const state = new URL(url).searchParams.get('state')!
    const [encoded] = state.split('.')
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))

    expect(decoded).not.toHaveProperty('codeVerifier')
    expect(JSON.stringify(decoded)).not.toContain('codeVerifier')
    expect(decoded.workspaceId).toBe('ws_123')
  })

  it('stashes the codeVerifier server-side, retrievable exactly once via consumeCodeVerifier', async () => {
    const { url } = await getAuthUrl('ws_123')
    const params = new URL(url).searchParams
    const state = params.get('state')!
    const codeChallenge = params.get('code_challenge')!

    const verifier = await consumeCodeVerifier(state)
    expect(verifier).not.toBeNull()

    // Sanity: the retrieved verifier is the same one the challenge sent to Twitter
    // was derived from (S256), i.e. this is genuinely the matching PKCE pair.
    const expectedChallenge = crypto.createHash('sha256').update(verifier!).digest('base64url')
    expect(expectedChallenge).toBe(codeChallenge)

    // Single-use: a second lookup for the same state must come back empty, same as
    // an authorization code itself is single-use.
    const second = await consumeCodeVerifier(state)
    expect(second).toBeNull()
  })

  it('returns null when looking up a codeVerifier for an unknown/forged state', async () => {
    const result = await consumeCodeVerifier('not-a-real-state.sig')
    expect(result).toBeNull()
  })
})
