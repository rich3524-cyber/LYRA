import { timingSafeEqual } from 'crypto'
import { cache } from 'react'
import { auth0 } from './auth0'
import { prisma } from './prisma'

export const getCurrentUser = cache(async () => {
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
