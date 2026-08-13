import { describe, it, expect } from 'vitest'
import { resolveCreateStatus, canSelfApprove, resolveApprovalTransition } from './post-lifecycle'

describe('resolveCreateStatus', () => {
  it('routes a SCHEDULED request to PENDING_APPROVAL when the workspace requires client approval', () => {
    expect(resolveCreateStatus('SCHEDULED', 'APPROVE')).toBe('PENDING_APPROVAL')
  })

  it('leaves a SCHEDULED request unchanged when the workspace does not require client approval', () => {
    expect(resolveCreateStatus('SCHEDULED', 'NONE')).toBe('SCHEDULED')
  })

  it('never redirects a DRAFT request regardless of clientAccessLevel', () => {
    expect(resolveCreateStatus('DRAFT', 'APPROVE')).toBe('DRAFT')
  })
})

describe('canSelfApprove', () => {
  it('allows approval when the viewer did not author the post, regardless of other approvers', () => {
    expect(canSelfApprove({ isAuthor: false, hasOtherApprover: true })).toBe(true)
    expect(canSelfApprove({ isAuthor: false, hasOtherApprover: false })).toBe(true)
  })

  it('blocks self-approval when the viewer authored the post and another approver-capable member exists', () => {
    expect(canSelfApprove({ isAuthor: true, hasOtherApprover: true })).toBe(false)
  })

  it('allows self-approval when the viewer authored the post and no other approver-capable member exists', () => {
    expect(canSelfApprove({ isAuthor: true, hasOtherApprover: false })).toBe(true)
  })
})

describe('resolveApprovalTransition', () => {
  it('jumps straight to SCHEDULED when approving a post whose media and schedule are both already ready', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'APPROVED', existingStatus: 'PENDING_APPROVAL', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('SCHEDULED')
  })

  it('stays at APPROVED when media is still required and missing', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'APPROVED', existingStatus: 'PENDING_APPROVAL', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: false, hasScheduledAt: true,
    })).toBe('APPROVED')
  })

  it('stays at APPROVED when there is no scheduledAt yet, even if media is ready', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'APPROVED', existingStatus: 'PENDING_APPROVAL', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: false,
    })).toBe('APPROVED')
  })

  it('redirects a SCHEDULED request from DRAFT to PENDING_APPROVAL when the workspace requires client approval', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'DRAFT', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('PENDING_APPROVAL')
  })

  it('leaves a SCHEDULED request unchanged when the workspace does not require client approval', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'DRAFT', clientAccessLevel: 'NONE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('SCHEDULED')
  })

  it('exempts an already-APPROVED post with unchanged content from being redirected back to PENDING_APPROVAL', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'APPROVED', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('SCHEDULED')
  })

  it('bypass fix: redirects an APPROVED post with CHANGED content back to PENDING_APPROVAL for re-review', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'APPROVED', clientAccessLevel: 'APPROVE',
      contentChanged: true, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('PENDING_APPROVAL')
  })

  it('passes through an undefined requestedStatus unchanged (a PATCH that does not touch status)', () => {
    expect(resolveApprovalTransition({
      requestedStatus: undefined, existingStatus: 'DRAFT', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBeUndefined()
  })
})
