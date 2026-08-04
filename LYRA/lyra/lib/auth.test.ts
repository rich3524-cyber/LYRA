import { describe, it, expect, vi } from 'vitest'
import { getUserFromBearerToken } from './auth'

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
