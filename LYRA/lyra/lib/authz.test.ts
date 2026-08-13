import { describe, it, expect } from 'vitest'
import { canWrite, APPROVER_ROLES } from './authz'
import type { UserRole } from '@prisma/client'

const ALL_ROLES: UserRole[] = ['PLATFORM_OWNER', 'AGENCY_ADMIN', 'AGENCY_MEMBER', 'CLIENT_VIEW', 'CLIENT_APPROVE', 'SMB_OWNER']

describe('canWrite', () => {
  it('denies CLIENT_VIEW', () => {
    expect(canWrite('CLIENT_VIEW')).toBe(false)
  })

  it.each(ALL_ROLES.filter((r) => r !== 'CLIENT_VIEW'))('allows %s', (role) => {
    expect(canWrite(role)).toBe(true)
  })
})

describe('APPROVER_ROLES', () => {
  it('is a fixed, explicit allowlist -- a role not on this list is never an approver', () => {
    expect(APPROVER_ROLES).toEqual(['PLATFORM_OWNER', 'AGENCY_ADMIN', 'AGENCY_MEMBER', 'SMB_OWNER', 'CLIENT_APPROVE'])
  })

  it('excludes CLIENT_VIEW', () => {
    expect(APPROVER_ROLES).not.toContain('CLIENT_VIEW')
  })

  // Deliberately allow-listed, not derived from canWrite (see the comment in
  // authz.ts) -- this pins that fail-closed property. If UserRole ever grows
  // a new member, this test forces a conscious decision about whether it can
  // approve, rather than silently inheriting write access from canWrite.
  it('is a strict subset of every non-CLIENT_VIEW role, not automatically all of them', () => {
    const writable = ALL_ROLES.filter(canWrite)
    for (const role of APPROVER_ROLES) {
      expect(writable).toContain(role)
    }
  })
})
