export interface CrisisKeywordSuggestion {
  keyword:  string
  category: 'legal' | 'safety' | 'discrimination' | 'media' | 'business_specific'
}

export interface CrisisKeywordSuggestionState {
  keyword:   string
  category:  string
  dismissed: boolean
}

/**
 * Merges freshly-generated suggestions into the existing list. A new
 * suggestion is skipped (not appended, not un-dismissed) if its keyword
 * already exists in `existing` -- dismissed or not -- or already matches an
 * active guardrail. If `newSuggestions` itself contains keywords that match
 * case-insensitively, only the first occurrence is kept. Existing entries
 * are never modified.
 */
export function mergeCrisisKeywordSuggestions(
  existing: CrisisKeywordSuggestionState[],
  newSuggestions: CrisisKeywordSuggestion[],
  activeGuardrailKeywords: string[]
): CrisisKeywordSuggestionState[] {
  const seen = new Set([
    ...existing.map((s) => s.keyword.toLowerCase()),
    ...activeGuardrailKeywords.map((k) => k.toLowerCase()),
  ])

  const additions: CrisisKeywordSuggestionState[] = []
  for (const s of newSuggestions) {
    const key = s.keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    additions.push({ keyword: s.keyword, category: s.category, dismissed: false })
  }

  return [...existing, ...additions]
}
