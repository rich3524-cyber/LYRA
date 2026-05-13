import { auth0 } from './auth0'
import { prisma } from './prisma'

export async function getCurrentUser() {
  const session = await auth0.getSession()
  if (!session?.user) return null

  return prisma.user.findUnique({
    where: { auth0Id: session.user.sub },
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
