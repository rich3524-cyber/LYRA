import { timingSafeEqual } from 'crypto'
import { cache } from 'react'
import { headers } from 'next/headers'
import { auth0 } from './auth0'
import { prisma } from './prisma'
import { verifyAuth0AccessToken } from './jwt-verify'

interface BearerAuthDeps {
  verifyToken: typeof verifyAuth0AccessToken
  prisma: { user: { findUnique: typeof prisma.user.findUnique } }
}

const defaultBearerAuthDeps: BearerAuthDeps = { verifyToken: verifyAuth0AccessToken, prisma }

// Additive bearer-token auth path for MCP (and any future API-token) clients,
// sitting alongside -- never replacing -- the Auth0 session-cookie path
// below. A request with no Authorization header (every existing web-app
// request) falls straight through with zero behavior change.
//
// Deliberately findUnique, not upsert: a bearer token can only authenticate
// as a user who already exists in LYRA (has a real WorkspaceAccess row from
// having used the web app at least once). See the "does not create a user"
// test case for why silently provisioning a blank user here would be unsafe.
export async function getUserFromBearerToken(
  authHeader: string | null,
  deps: BearerAuthDeps = defaultBearerAuthDeps
) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length)

  const payload = await deps.verifyToken(token)
  if (!payload) return null

  try {
    return await deps.prisma.user.findUnique({
      where: { auth0Id: payload.sub },
      include: {
        agency: true,
        workspaceAccess: { include: { workspace: true } },
      },
    })
  } catch (err) {
    console.error('[getUserFromBearerToken] prisma.user.findUnique failed:', err)
    return null
  }
}

export const getCurrentUser = cache(async () => {
  const hdrs = await headers()
  const bearerUser = await getUserFromBearerToken(hdrs.get('authorization'))
  // Bearer wins over any session cookie also present on the request: an
  // MCP/API caller presenting a bearer token is asserting a specific
  // identity and should authenticate as that token's user, not whatever
  // stale browser session cookie happens to be riding along.
  if (bearerUser) return bearerUser

  let session: Awaited<ReturnType<typeof auth0.getSession>>
  try {
    session = await auth0.getSession()
  } catch (err) {
    console.error('[getCurrentUser] auth0.getSession failed:', err)
    return null
  }
  if (!session?.user) return null

  const { sub, email, name, picture } = session.user

  try {
    return await prisma.user.upsert({
      where: { auth0Id: sub },
      create: {
        auth0Id: sub,
        email:   email ?? '',
        name:    name  ?? null,
        avatarUrl: picture ?? null,
      },
      update: {
        email:     email ?? undefined,
        name:      name  ?? undefined,
        avatarUrl: picture ?? undefined,
      },
      include: {
        agency: true,
        workspaceAccess: { include: { workspace: true } },
      },
    })
  } catch (err) {
    console.error('[getCurrentUser] prisma.user.upsert failed:', err)
    return null
  }
})

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

// Single source of truth for cron-route auth -- previously duplicated (correctly,
// timing-safe) across 4 separate cron route files, while this exported version
// was the one nobody imported and used a timing-unsafe `===` comparison. Fixed
// and consolidated 18 Jul 2026 so there's only one implementation to get right.
export function checkCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (auth.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
}
