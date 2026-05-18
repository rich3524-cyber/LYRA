import { auth0 } from './auth0'
import { prisma } from './prisma'

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
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}
