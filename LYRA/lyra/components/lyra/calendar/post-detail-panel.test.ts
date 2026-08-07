import { describe, it, expect } from 'vitest'
import { getNextStatuses } from './post-detail-panel'

describe('getNextStatuses', () => {
  describe('PENDING_APPROVAL', () => {
    // Regression test: previously only CLIENT_APPROVE saw an Approve option
    // here -- every other role the backend actually authorizes to approve
    // (app/api/posts/[id]/route.ts's APPROVER_ROLES) had no path to approve
    // a post at all, only "Recall for editing". Each of these 5 roles must
    // see the same Approve/Request-changes pair.
    for (const role of ['PLATFORM_OWNER', 'AGENCY_ADMIN', 'AGENCY_MEMBER', 'SMB_OWNER', 'CLIENT_APPROVE']) {
      it(`offers Approve and Request changes for role ${role}`, () => {
        const options = getNextStatuses('PENDING_APPROVAL', role, 'APPROVE', false)
        expect(options).toEqual([
          { value: 'APPROVED', label: 'Approve', variant: 'approve' },
          { value: 'DRAFT', label: 'Request changes', variant: 'reject' },
        ])
      })
    }

    it('offers no actions for the read-only CLIENT_VIEW role', () => {
      const options = getNextStatuses('PENDING_APPROVAL', 'CLIENT_VIEW', 'APPROVE', false)
      expect(options).toEqual([])
    })
  })

  describe('CLIENT_APPROVE outside PENDING_APPROVAL', () => {
    // Regression test: flattening the role-first gate into a status-first
    // gate (to fix the main bug above) could let CLIENT_APPROVE fall through
    // into the staff-facing switch statement and see scheduling/cancel
    // actions it was never meant to have -- it should see nothing outside
    // the approval decision itself, same as before this fix.
    for (const status of ['DRAFT', 'APPROVED', 'SCHEDULED', 'FAILED', 'CANCELLED']) {
      it(`offers no actions for CLIENT_APPROVE on ${status}`, () => {
        expect(getNextStatuses(status, 'CLIENT_APPROVE', 'APPROVE', false)).toEqual([])
      })
    }
  })

  describe('DRAFT', () => {
    it('includes "Submit for approval" when the workspace requires client approval', () => {
      const options = getNextStatuses('DRAFT', 'AGENCY_ADMIN', 'APPROVE', false)
      expect(options).toEqual([
        { value: 'PENDING_APPROVAL', label: 'Submit for approval' },
        { value: 'SCHEDULED', label: 'Mark as scheduled' },
      ])
    })

    it('omits "Submit for approval" when the workspace does not require it', () => {
      const options = getNextStatuses('DRAFT', 'AGENCY_ADMIN', 'NONE', false)
      expect(options).toEqual([{ value: 'SCHEDULED', label: 'Mark as scheduled' }])
    })
  })

  describe('other statuses -- unchanged by this fix', () => {
    it('APPROVED offers Schedule post and Move back to draft', () => {
      expect(getNextStatuses('APPROVED', 'AGENCY_ADMIN', 'APPROVE', false)).toEqual([
        { value: 'SCHEDULED', label: 'Schedule post' },
        { value: 'DRAFT', label: 'Move back to draft' },
      ])
    })

    it('SCHEDULED offers Move back to draft and Cancel post', () => {
      expect(getNextStatuses('SCHEDULED', 'AGENCY_ADMIN', 'APPROVE', false)).toEqual([
        { value: 'DRAFT', label: 'Move back to draft' },
        { value: 'CANCELLED', label: 'Cancel post' },
      ])
    })

    it('FAILED and CANCELLED both offer only Move back to draft', () => {
      expect(getNextStatuses('FAILED', 'AGENCY_ADMIN', 'APPROVE', false)).toEqual([
        { value: 'DRAFT', label: 'Move back to draft' },
      ])
      expect(getNextStatuses('CANCELLED', 'AGENCY_ADMIN', 'APPROVE', false)).toEqual([
        { value: 'DRAFT', label: 'Move back to draft' },
      ])
    })
  })

  describe('isAwaitingMedia filtering', () => {
    it('strips the SCHEDULED option when media is still awaited', () => {
      const options = getNextStatuses('APPROVED', 'AGENCY_ADMIN', 'APPROVE', true)
      expect(options).toEqual([{ value: 'DRAFT', label: 'Move back to draft' }])
    })

    it('does not affect PENDING_APPROVAL, since neither of its options is SCHEDULED', () => {
      const options = getNextStatuses('PENDING_APPROVAL', 'AGENCY_ADMIN', 'APPROVE', true)
      expect(options).toEqual([
        { value: 'APPROVED', label: 'Approve', variant: 'approve' },
        { value: 'DRAFT', label: 'Request changes', variant: 'reject' },
      ])
    })
  })
})
