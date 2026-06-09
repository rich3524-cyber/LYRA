import { auth0 } from './auth0'
import { prisma } from './prisma'
import { timingSafeEqual } from 'crypto'

// Constant-time cron secret verification — prevents timing side-channel attacks.
// Use this in every /api/cron/* route instead of plain !== comparison.
export function checkCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (auth.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function getCurrentUser() {
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
    // Fast path: read-only lookup. The upsert only runs when the user is not yet in the DB
    // (first login) or when profile fields have changed from Auth0.
    const existing = await prisma.user.findUnique({
      where:   { auth0Id: sub },
      include: {
        agency: true,
        workspaceAccess: { include: { workspace: true } },
      },
    })

    if (existing) {
      // Update profile fields only when they've actually changed (avoids write on every request)
      const needsUpdate =
        (email && existing.email !== email) ||
        (name  && existing.name  !== name)  ||
        (picture && existing.avatarUrl !== picture)

      if (needsUpdate) {
        return await prisma.user.update({
          where:   { auth0Id: sub },
          data: {
            email:     email     ?? undefined,
            name:      name      ?? undefined,
            avatarUrl: picture   ?? undefined,
          },
          include: {
            agency: true,
            workspaceAccess: { include: { workspace: true } },
          },
        })
      }

      return existing
    }

    // First login — create the user record
    return await prisma.user.create({
      data: {
        auth0Id:   sub,
        email:     email   ?? '',
        name:      name    ?? null,
        avatarUrl: picture ?? null,
      },
      include: {
        agency: true,
        workspaceAccess: { include: { workspace: true } },
      },
    })
  } catch (err) {
    console.error('[getCurrentUser] prisma error:', err)
    return null
  }
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}
