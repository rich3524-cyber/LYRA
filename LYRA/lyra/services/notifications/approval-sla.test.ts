// services/notifications/approval-sla.test.ts
import { describe, it, expect } from 'vitest'
import { approvalDeadline, isApprovalOverdue, hoursWaiting } from './approval-sla'

const CONFIG = { approvalSlaHours: 4, approvalSlaUnscheduledHours: 24 }
const NOW = new Date('2026-08-11T12:00:00Z')

describe('approvalDeadline', () => {
  it('subtracts the threshold from a scheduled time', () => {
    const deadline = approvalDeadline(
      { scheduledAt: new Date('2026-08-11T18:00:00Z'), submittedAt: new Date('2026-08-10T09:00:00Z') },
      CONFIG
    )
    expect(deadline?.toISOString()).toBe('2026-08-11T14:00:00.000Z')
  })

  it('prefers the scheduled-time rule when both are available', () => {
    // submittedAt + 24h would be 09:00 on the 11th; scheduledAt - 4h is 14:00.
    const deadline = approvalDeadline(
      { scheduledAt: new Date('2026-08-11T18:00:00Z'), submittedAt: new Date('2026-08-10T09:00:00Z') },
      CONFIG
    )
    expect(deadline?.toISOString()).toBe('2026-08-11T14:00:00.000Z')
  })

  it('falls back to submission plus the unscheduled threshold', () => {
    const deadline = approvalDeadline(
      { scheduledAt: null, submittedAt: new Date('2026-08-10T09:00:00Z') },
      CONFIG
    )
    expect(deadline?.toISOString()).toBe('2026-08-11T09:00:00.000Z')
  })

  it('returns null when there is no clock to measure at all', () => {
    // Rows predating this feature: unscheduled and never stamped.
    expect(approvalDeadline({ scheduledAt: null, submittedAt: null }, CONFIG)).toBeNull()
  })
})

describe('isApprovalOverdue', () => {
  it('is false before the deadline', () => {
    expect(
      isApprovalOverdue({ scheduledAt: new Date('2026-08-11T18:00:00Z'), submittedAt: null }, CONFIG, NOW)
    ).toBe(false)
  })

  it('is true exactly at the deadline, not only after it', () => {
    expect(
      isApprovalOverdue({ scheduledAt: new Date('2026-08-11T16:00:00Z'), submittedAt: null }, CONFIG, NOW)
    ).toBe(true)
  })

  it('is true for a post already past its scheduled time', () => {
    expect(
      isApprovalOverdue({ scheduledAt: new Date('2026-08-10T08:00:00Z'), submittedAt: null }, CONFIG, NOW)
    ).toBe(true)
  })

  it('is true for an unscheduled post past its submission window', () => {
    expect(
      isApprovalOverdue({ scheduledAt: null, submittedAt: new Date('2026-08-10T09:00:00Z') }, CONFIG, NOW)
    ).toBe(true)
  })

  it('is false for an unscheduled post still inside its window', () => {
    expect(
      isApprovalOverdue({ scheduledAt: null, submittedAt: new Date('2026-08-11T06:00:00Z') }, CONFIG, NOW)
    ).toBe(false)
  })

  it('never flags a legacy row with no clock', () => {
    // The property that matters most: shipping this must not fire an alert for
    // every pre-existing pending approval at once.
    expect(isApprovalOverdue({ scheduledAt: null, submittedAt: null }, CONFIG, NOW)).toBe(false)
  })

  it('respects a per-workspace threshold override', () => {
    const subject = { scheduledAt: new Date('2026-08-11T18:00:00Z'), submittedAt: null }
    expect(isApprovalOverdue(subject, { ...CONFIG, approvalSlaHours: 4 }, NOW)).toBe(false)
    expect(isApprovalOverdue(subject, { ...CONFIG, approvalSlaHours: 24 }, NOW)).toBe(true)
  })
})

describe('hoursWaiting', () => {
  it('floors to whole hours', () => {
    expect(hoursWaiting(new Date('2026-08-11T06:30:00Z'), NOW)).toBe(5)
  })

  it('returns 0 rather than a negative on clock skew', () => {
    expect(hoursWaiting(new Date('2026-08-11T13:00:00Z'), NOW)).toBe(0)
  })

  it('returns 0 when never stamped', () => {
    expect(hoursWaiting(null, NOW)).toBe(0)
  })
})
