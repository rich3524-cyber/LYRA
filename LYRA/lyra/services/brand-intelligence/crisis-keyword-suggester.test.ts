// services/brand-intelligence/crisis-keyword-suggester.test.ts
import { describe, it, expect } from 'vitest'
import { mergeCrisisKeywordSuggestions } from './crisis-keyword-suggester'

describe('mergeCrisisKeywordSuggestions', () => {
  it('appends genuinely new suggestions to an empty existing list', () => {
    const result = mergeCrisisKeywordSuggestions(
      [],
      [{ keyword: 'lawsuit', category: 'legal' }],
      []
    )
    expect(result).toEqual([{ keyword: 'lawsuit', category: 'legal', dismissed: false }])
  })

  it('skips a new suggestion whose keyword already exists in the existing list, case-insensitively', () => {
    const result = mergeCrisisKeywordSuggestions(
      [{ keyword: 'Lawsuit', category: 'legal', dismissed: false }],
      [{ keyword: 'lawsuit', category: 'legal' }],
      []
    )
    expect(result).toEqual([{ keyword: 'Lawsuit', category: 'legal', dismissed: false }])
  })

  it('skips a new suggestion whose keyword already exists as a dismissed entry -- does not un-dismiss it', () => {
    const result = mergeCrisisKeywordSuggestions(
      [{ keyword: 'lawsuit', category: 'legal', dismissed: true }],
      [{ keyword: 'lawsuit', category: 'legal' }],
      []
    )
    expect(result).toEqual([{ keyword: 'lawsuit', category: 'legal', dismissed: true }])
  })

  it('skips a new suggestion that matches an active guardrail keyword, case-insensitively', () => {
    const result = mergeCrisisKeywordSuggestions(
      [],
      [{ keyword: 'refund fraud', category: 'business_specific' }],
      ['Refund Fraud']
    )
    expect(result).toEqual([])
  })

  it('preserves existing entries unchanged and appends only the new ones', () => {
    const result = mergeCrisisKeywordSuggestions(
      [{ keyword: 'lawsuit', category: 'legal', dismissed: false }],
      [
        { keyword: 'lawsuit', category: 'legal' },
        { keyword: 'food poisoning', category: 'business_specific' },
      ],
      []
    )
    expect(result).toEqual([
      { keyword: 'lawsuit', category: 'legal', dismissed: false },
      { keyword: 'food poisoning', category: 'business_specific', dismissed: false },
    ])
  })

  it('collapses a case-insensitive duplicate within the same newSuggestions batch to a single entry', () => {
    const result = mergeCrisisKeywordSuggestions(
      [],
      [
        { keyword: 'lawsuit', category: 'legal' },
        { keyword: 'Lawsuit', category: 'legal' },
      ],
      []
    )
    expect(result).toEqual([{ keyword: 'lawsuit', category: 'legal', dismissed: false }])
  })
})
