import type { UserRole } from '@prisma/client'

// CLIENT_VIEW is the product's read-only tier (clients get calendar/analytics visibility,
// nothing else) -- but role checks were only ever applied to 4 of 66 mutating routes, so a
// CLIENT_VIEW user could call any of the other 62 directly and publish posts, spend ad
// budget, delete crisis keywords, or reply publicly as the brand. This is the one shared
// rule every mutating workspace-scoped route should apply: block CLIENT_VIEW, allow
// everything else exactly as before. Routes with a genuinely narrower policy (workspace
// settings/deletion -> OWNER_ROLES, post approval -> APPROVER_ROLES) already define their
// own stricter role lists and don't need this.
export function canWrite(role: UserRole): boolean {
  return role !== 'CLIENT_VIEW'
}
