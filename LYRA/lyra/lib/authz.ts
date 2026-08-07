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

// Kept as its own explicit allowlist rather than derived from canWrite, even
// though the two currently agree (both exclude only CLIENT_VIEW). They have
// different failure modes: canWrite is deny-one (a new role gets write access
// automatically unless it's CLIENT_VIEW), while this is allow-listed (a new
// role gets nothing until explicitly added here). For an approval gate,
// fail-closed-by-default is the property that matters -- collapsing this into
// canWrite would silently flip it to fail-open the next time UserRole grows.
export const APPROVER_ROLES: readonly UserRole[] = ['PLATFORM_OWNER', 'AGENCY_ADMIN', 'AGENCY_MEMBER', 'SMB_OWNER', 'CLIENT_APPROVE'] as const
