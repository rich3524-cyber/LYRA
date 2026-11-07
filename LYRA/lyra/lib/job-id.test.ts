import { describe, it, expect } from 'vitest'
import { tickScopedJobId } from './job-id'

describe('tickScopedJobId', () => {
  const WINDOW = 5 * 60_000
  // Windows are absolute epoch-aligned buckets, not relative to the first
  // call, so a test asserting "same window" has to start on a boundary --
  // an arbitrary timestamp plus (WINDOW - 1) can straddle two buckets.
  const BOUNDARY = Math.floor(1_000_000_000 / WINDOW) * WINDOW

  // The property that matters: two ticks close together still collapse to one
  // job, so the de-duplication a stable id provided is preserved.
  it('gives two calls inside the same window the same id', () => {
    const a = tickScopedJobId('monitor-acc1', WINDOW, BOUNDARY)
    const b = tickScopedJobId('monitor-acc1', WINDOW, BOUNDARY + WINDOW - 1)

    expect(a).toBe(b)
  })

  // ...and the property that was missing: the id has to move on, or one
  // failed job parks it forever and the queue dies silently.
  it('gives the next window a different id', () => {
    const a = tickScopedJobId('monitor-acc1', WINDOW, BOUNDARY)
    const b = tickScopedJobId('monitor-acc1', WINDOW, BOUNDARY + WINDOW)

    expect(a).not.toBe(b)
  })

  it('keeps different entities apart within the same window', () => {
    const now = 1_000_000_000
    expect(tickScopedJobId('monitor-acc1', WINDOW, now)).not.toBe(tickScopedJobId('monitor-acc2', WINDOW, now))
  })

  it('keeps the prefix readable so a job id still says what it is', () => {
    expect(tickScopedJobId('monitor-acc1', WINDOW, 1_000_000_000)).toMatch(/^monitor-acc1-\d+$/)
  })

  // A zero or negative window would make every id identical again (or throw
  // on divide), quietly restoring the exact bug this function exists to stop.
  it.each([0, -1, Number.NaN])('refuses a nonsensical window (%p)', (bad) => {
    expect(() => tickScopedJobId('monitor-acc1', bad, 1_000_000_000)).toThrow(/positive number/)
  })
})
