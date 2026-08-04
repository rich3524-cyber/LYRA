import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

vi.mock('./auth0', () => ({
  auth0: { getSession: vi.fn() },
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('./jwt-verify', () => ({
  verifyAuth0AccessToken: vi.fn(),
}))

import { getUserFromBearerToken, getCurrentUser } from './auth'
import { headers } from 'next/headers'
import { auth0 } from './auth0'
import { prisma } from './prisma'
import { verifyAuth0AccessToken } from './jwt-verify'

describe('getUserFromBearerToken', () => {
  it('returns null when there is no Authorization header', async () => {
    const result = await getUserFromBearerToken(null, {
      verifyToken: vi.fn(),
      prisma: { user: { findUnique: vi.fn() } },
    })
    expect(result).toBeNull()
  })

  it('returns null when the Authorization header is not a Bearer token', async () => {
    const result = await getUserFromBearerToken('Basic dXNlcjpwYXNz', {
      verifyToken: vi.fn(),
      prisma: { user: { findUnique: vi.fn() } },
    })
    expect(result).toBeNull()
  })

  it('returns null when the token fails verification', async () => {
    const verifyToken = vi.fn().mockResolvedValue(null)
    const result = await getUserFromBearerToken('Bearer bad-token', {
      verifyToken,
      prisma: { user: { findUnique: vi.fn() } },
    })
    expect(result).toBeNull()
    expect(verifyToken).toHaveBeenCalledWith('bad-token')
  })

  it('looks up the user by auth0Id from the verified token sub claim and returns it', async () => {
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'auth0|user123' })
    const findUnique = vi.fn().mockResolvedValue({ id: 'u1', auth0Id: 'auth0|user123', email: 'a@b.com' })
    const result = await getUserFromBearerToken('Bearer good-token', {
      verifyToken,
      prisma: { user: { findUnique } },
    })
    expect(result).toEqual({ id: 'u1', auth0Id: 'auth0|user123', email: 'a@b.com' })
    expect(findUnique).toHaveBeenCalledWith({
      where: { auth0Id: 'auth0|user123' },
      include: { agency: true, workspaceAccess: { include: { workspace: true } } },
    })
  })

  it('returns null (does not create a user) when the verified token has no matching LYRA user', async () => {
    // Deliberate: a bearer token can only authenticate as a user who already
    // exists in LYRA (i.e. has logged into the web app at least once and has
    // a WorkspaceAccess row). Auto-provisioning a new blank User from an
    // MCP-only identity would let anyone with a valid Auth0 login silently
    // acquire a LYRA account with no workspace access checks anywhere else
    // in the app ever having run.
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'auth0|unknown-user' })
    const findUnique = vi.fn().mockResolvedValue(null)
    const result = await getUserFromBearerToken('Bearer good-token', {
      verifyToken,
      prisma: { user: { findUnique } },
    })
    expect(result).toBeNull()
  })

  it('returns null and logs when the database lookup throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'auth0|user123' })
    const findUnique = vi.fn().mockRejectedValue(new Error('db down'))
    const result = await getUserFromBearerToken('Bearer good-token', {
      verifyToken,
      prisma: { user: { findUnique } },
    })
    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe('getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the bearer-token user without touching the session-cookie path when a valid bearer token is present', async () => {
    const headersGet = vi.fn().mockReturnValue('Bearer good-token')
    vi.mocked(headers).mockResolvedValue({ get: headersGet } as unknown as Awaited<ReturnType<typeof headers>>)
    vi.mocked(verifyAuth0AccessToken).mockResolvedValue({ sub: 'auth0|bearer-user' })
    const bearerUser = { id: 'u-bearer', auth0Id: 'auth0|bearer-user' }
    vi.mocked(prisma.user.findUnique).mockResolvedValue(bearerUser as never)

    // React's cache() only memoizes inside an active render context; outside
    // one (as here) it calls straight through on every invocation, so no
    // stale value can leak in from a previous test.
    const result = await getCurrentUser()

    expect(result).toEqual(bearerUser)
    expect(auth0.getSession).not.toHaveBeenCalled()
    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('falls through to the session-cookie path when there is no bearer token', async () => {
    const headersGet = vi.fn().mockReturnValue(null)
    vi.mocked(headers).mockResolvedValue({ get: headersGet } as unknown as Awaited<ReturnType<typeof headers>>)
    vi.mocked(auth0.getSession).mockResolvedValue({
      user: { sub: 'auth0|session-user', email: 'a@b.com', name: 'A B', picture: null },
    } as never)
    const sessionUser = { id: 'u-session', auth0Id: 'auth0|session-user' }
    vi.mocked(prisma.user.upsert).mockResolvedValue(sessionUser as never)

    const result = await getCurrentUser()

    expect(result).toEqual(sessionUser)
    expect(verifyAuth0AccessToken).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })
})
