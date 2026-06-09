import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// connection_limit=2 prevents connection pool exhaustion in serverless (Netlify Functions).
// Each function instance opens its own pool; without a cap, 25 instances × default 4 = 100
// connections — well above Supabase's 25-100 limit. Keep it low; PgBouncer handles pooling.
function buildDbUrl() {
  const base = process.env.DATABASE_URL ?? ''
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}connection_limit=2&pool_timeout=10`
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:        process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
    datasources: { db: { url: buildDbUrl() } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
