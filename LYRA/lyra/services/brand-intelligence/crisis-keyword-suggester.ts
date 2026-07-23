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
 * active guardrail. Existing entries are never modified.
 */
export function mergeCrisisKeywordSuggestions(
  existing: CrisisKeywordSuggestionState[],
  newSuggestions: CrisisKeywordSuggestion[],
  activeGuardrailKeywords: string[]
): CrisisKeywordSuggestionState[] {
  const existingKeys = new Set(existing.map((s) => s.keyword.toLowerCase()))
  const activeKeys    = new Set(activeGuardrailKeywords.map((k) => k.toLowerCase()))

  const additions = newSuggestions
    .filter((s) => !existingKeys.has(s.keyword.toLowerCase()) && !activeKeys.has(s.keyword.toLowerCase()))
    .map((s) => ({ keyword: s.keyword, category: s.category, dismissed: false }))

  return [...existing, ...additions]
}
