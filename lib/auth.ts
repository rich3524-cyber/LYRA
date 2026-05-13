import { auth0 } from './auth0'
import { prisma } from './prisma'

export async function getCurrentUser() {
  const session = await auth0.getSession()
  if (!session?.user) return null

  const { sub, email, name, picture } = session.user

  return prisma.user.upsert({
    where: { auth0Id: sub },
    create: {
      auth0Id: sub,
      email:   email ?? '',
      name:    name  ?? null,
      avatarUrl: picture ?? null,
      updatedAt: new Date(),
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
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}
