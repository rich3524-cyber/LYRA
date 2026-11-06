import { describe, it, expect, vi, beforeEach } from 'vitest'

const { connections } = vi.hoisted(() => ({
  connections: [] as Array<Record<string, unknown>>,
}))

// lib/redis.ts constructs its shared connections at module import time, so the
// real ioredis has to be replaced before the import rather than spied on after
// it. Capturing the options object each constructor receives is also the only
// way to assert on retryStrategy, which is otherwise invisible from outside.
vi.mock('ioredis', () => ({
  default: class FakeRedis {
    constructor(public options: Record<string, unknown>) {
      connections.push(options)
    }
    on() {
      return this
    }
  },
}))

/**
 * Re-imports the module under whatever env the test has just stubbed.
 *
 * vi.resetModules() alone is not enough: outside production the module stashes
 * both connections on globalThis (so Next's dev server does not leak a new
 * one per hot reload), and that cache outlives the module registry -- a second
 * import would otherwise hand back the previous test's connection and
 * construct nothing. Clearing the globals is what makes each case independent.
 */
async function loadRedis() {
  vi.resetModules()
  const globalForRedis = globalThis as { bullRedis?: unknown; redisClient?: unknown }
  delete globalForRedis.bullRedis
  delete globalForRedis.redisClient
  connections.length = 0
  return import('./redis')
}

describe('REDIS_URL handling', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('connects to the host in REDIS_URL, enabling TLS for rediss://', async () => {
    vi.stubEnv('REDIS_URL', 'rediss://default:secret@eu1-example.upstash.io:6379')

    await loadRedis()

    expect(connections[0]).toMatchObject({
      host: 'eu1-example.upstash.io',
      port: 6379,
      password: 'secret',
      tls: {},
    })
  })

  // The regression test for the 5 Nov 2026 worker outage. REDIS_URL was unset
  // on a Railway service, this module quietly substituted localhost, and the
  // result was an endless ECONNREFUSED 127.0.0.1:6379 loop that named nothing
  // -- indistinguishable in the logs from the genuine Upstash outage happening
  // alongside it. Production must refuse to start rather than retry forever
  // against a Redis that cannot exist there.
  it('refuses to start in production when REDIS_URL is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REDIS_URL', '')

    await expect(loadRedis()).rejects.toThrow(/REDIS_URL is not set/)
  })

  // `next build` runs as NODE_ENV=production but never opens a connection, so
  // throwing there would break the Netlify deploy over a variable the build
  // itself does not use.
  it('still imports during next build without REDIS_URL', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REDIS_URL', '')
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')

    await expect(loadRedis()).resolves.toBeDefined()
    expect(connections[0]).toMatchObject({ host: 'localhost', port: 6379 })
  })

  it('falls back to localhost in development, saying so out loud', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('REDIS_URL', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await loadRedis()

    expect(connections[0]).toMatchObject({ host: 'localhost', port: 6379 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('REDIS_URL is not set'))
  })

  it('rejects a malformed REDIS_URL rather than guessing a host', async () => {
    vi.stubEnv('REDIS_URL', 'not-a-url')

    await expect(loadRedis()).rejects.toThrow(/not a valid URL/)
  })
})

describe('retryStrategy', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  // ioredis defaults to a 2 second ceiling. Across a multi-day outage that is
  // what turned 7 workers into a 500 log/sec flood and helped hold Upstash's
  // rate limiter open. The ceiling is the part that matters, so assert it
  // holds however long the outage runs.
  it('ramps the reconnect delay and holds it at 10 seconds', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')

    await loadRedis()
    const retry = connections[0].retryStrategy as (times: number) => number

    expect(retry(1)).toBe(200)
    expect(retry(10)).toBe(2_000)
    expect(retry(50)).toBe(10_000)
    expect(retry(100_000)).toBe(10_000)
  })
})
