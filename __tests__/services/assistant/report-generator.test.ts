import {
  getQuarterLabel,
  getPeriodBounds,
  calculateEngagementRate,
} from '@/services/assistant/report-generator'

describe('getQuarterLabel', () => {
  it('returns Q1 for January', () => {
    expect(getQuarterLabel(new Date('2026-01-15'))).toBe('Q1-2026')
  })

  it('returns Q2 for April', () => {
    expect(getQuarterLabel(new Date('2026-04-01'))).toBe('Q2-2026')
  })

  it('returns Q3 for July', () => {
    expect(getQuarterLabel(new Date('2026-07-01'))).toBe('Q3-2026')
  })

  it('returns Q4 for October', () => {
    expect(getQuarterLabel(new Date('2026-10-31'))).toBe('Q4-2026')
  })
})

describe('getPeriodBounds', () => {
  it('covers exactly 90 days', () => {
    const { from, to } = getPeriodBounds(90)
    const diffMs = new Date(to).getTime() - new Date(from).getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(90)
  })

  it('to date is today', () => {
    const { to } = getPeriodBounds(90)
    const today = new Date().toISOString().split('T')[0]
    expect(to).toBe(today)
  })
})

describe('calculateEngagementRate', () => {
  it('calculates correctly with impressions', () => {
    const rate = calculateEngagementRate({ likes: 10, comments: 5, shares: 3, saves: 2, impressions: 200 })
    expect(rate).toBeCloseTo(0.1)
  })

  it('returns 0 when impressions are zero', () => {
    const rate = calculateEngagementRate({ likes: 10, comments: 5, shares: 3, saves: 2, impressions: 0 })
    expect(rate).toBe(0)
  })
})
