# Crisis Aware — AI-Suggested Keywords — Design Spec

**Date:** 2026-07-23
**Priority:** 1
**Status:** Approved for implementation

---

## Overview

Right now, Crisis Aware's `KEYWORD_MATCH` trigger reads from the `Guardrail` table (`type: ALWAYS_ESCALATE`), but there is no way for a real user to add a guardrail keyword — no UI, no API. The only way one has ever been created is direct database access, done manually for testing on 23 Jul 2026. This spec closes that gap by having Brand AI suggest crisis keywords automatically, using the same business analysis it already does, and gives the user a way to review, approve, dismiss, or manually add keywords on the Brand AI page.

This spec covers keyword suggestion and management only. **Email notification on crisis trigger is a separate, second spec** — Crisis Aware's escalation today is in-app only (banner + auto-pause posting), and there is no email-sending infrastructure anywhere in the codebase to send it through yet. That's out of scope here.

---

## Why Brand AI is the right place for this

Brand AI already runs one Claude call (`buildBrandProfile` in `services/brand-intelligence/profile-builder.ts`) that analyses the business's website, guidelines, and recent social posts to produce voice, tone, content themes, and audience profile. That same context — industry, audience, what the business talks about — is exactly what's needed to suggest realistic crisis keywords tailored to the business, rather than a generic list. Generating suggestions alongside a Brand AI build (initial build or a rebuild) means the user never has to think about crisis keywords separately; LYRA already has what it needs by the time it's learned the business.

---

## Keyword Suggestion Generation

A new, separate service function — not bolted onto `buildBrandProfile`'s existing prompt, so a problem generating crisis keywords can never break the core Brand AI build.

**New file:** `services/brand-intelligence/crisis-keyword-suggester.ts`

```typescript
export interface CrisisKeywordSuggestion {
  keyword: string
  category: 'legal' | 'safety' | 'discrimination' | 'media' | 'business_specific'
}

export async function suggestCrisisKeywords(
  websiteData: ScrapedWebsite,
  contentThemes: string[],
  audienceProfile: BrandProfileData['audienceProfile']
): Promise<CrisisKeywordSuggestion[]>
```

**Prompt approach — guided categories plus business-specific:**

Always consider four baseline categories (every business should have some coverage here regardless of industry):
- **Legal** — lawsuit, legal action, suing, attorney, etc.
- **Safety/health** — injury, allergic reaction, hospitalized, etc.
- **Discrimination/harassment** — discriminat*, racist, harassment claims, etc.
- **Media/press** — journalist, reporter, "going public," news story

Then, using the website data / content themes / audience already gathered, add business-specific keywords a generic list would miss — e.g. "food poisoning" for a restaurant, "data breach" for a software company, "allergic reaction" for a cosmetics brand.

Target 5–10 total suggestions. Called with `max_tokens` similar to the existing brand profile call; returns JSON, parsed the same defensive way `buildBrandProfile` already is.

**Called from:** `POST /api/brand-intelligence/build`, alongside the existing `buildBrandProfile` call, only when `workspace.crisisAware === true` (no point generating suggestions for a workspace that doesn't have the feature on — also avoids the extra Claude call/cost for everyone else). Note: this means turning Crisis Aware on for the first time won't retroactively produce suggestions until the next Brand AI rebuild — expected, not a bug; no auto-rebuild-on-toggle in this spec.

**Failure handling:** if this call fails or returns malformed JSON, log and continue — the Brand AI build itself must still succeed. Same "fail open" precedent already used in `crisis-detector.ts`.

---

## Data Model

No changes to the `Guardrail` table. Suggestions are **not** guardrails until approved — this keeps the crisis-detection code path (`crisis-detector.ts`, already tested and working) completely untouched by this feature.

```prisma
model BrandProfile {
  // existing fields ...
  suggestedCrisisKeywords Json?  // CrisisKeywordSuggestionState[] — see below
}
```

Shape stored in `suggestedCrisisKeywords`:

```typescript
interface CrisisKeywordSuggestionState {
  keyword:   string
  category:  string
  dismissed: boolean   // true once the user dismisses it; excluded from future re-suggestion
}
```

Entries are removed from this list once approved (they become a real `Guardrail` row instead). Dismissed entries stay in the list with `dismissed: true` so a future Brand AI rebuild never re-suggests something the user already said no to.

**Merge behavior on rebuild:** `POST /api/brand-intelligence/build` merges newly-generated suggestions into the existing `suggestedCrisisKeywords` list by keyword (case-insensitive) — skips anything already present as a `dismissed: true` entry, and skips anything that already exists as an active `Guardrail` (so an approved keyword never reappears as a pending suggestion). Only genuinely new suggestions get appended. Existing `Guardrail` rows are never read, written, or touched by a Brand AI build.

---

## API Endpoints

None of these exist today — there is currently no way to create, list, or delete a `Guardrail` row via API at all.

### `POST /api/brand-intelligence/crisis-keywords/approve`
- Auth: `requireAuth()` + workspace access check
- Body: `{ workspaceId: string, keyword: string, category?: string }`
- Creates a `Guardrail` row (`type: ALWAYS_ESCALATE`, `value: keyword`)
- If a matching entry exists in `BrandProfile.suggestedCrisisKeywords`, removes it from that list
- Used by both "approve a suggestion" and "add a custom keyword" (the latter simply won't have a matching suggestion entry to remove — same endpoint, same effect: a new active keyword)
- Returns the created guardrail

### `POST /api/brand-intelligence/crisis-keywords/dismiss`
- Auth: `requireAuth()` + workspace access check
- Body: `{ workspaceId: string, keyword: string }`
- Sets `dismissed: true` on the matching entry in `suggestedCrisisKeywords`
- Returns `{ ok: true }`

### `DELETE /api/guardrails/[id]`
- Auth: `requireAuth()` + workspace access check (via the guardrail's `workspaceId`)
- Deletes the `Guardrail` row (removing an already-active crisis keyword)
- Returns `{ ok: true }`

---

## UI

### New section on the Brand AI page, rendered only when `workspace.crisisAware === true`

Three parts, in order:

1. **Suggested keywords** — the non-dismissed entries from `suggestedCrisisKeywords` not yet approved. Chip-style, each showing the keyword and its category, with **Approve** and **Dismiss** buttons. Empty state: nothing rendered if there are no pending suggestions (not an empty box).
2. **Active keywords** — the workspace's current `ALWAYS_ESCALATE` guardrails (fetched alongside the Brand AI page's existing data load). Each with a **Remove** button.
3. **Add your own** — a small text input + Add button, calls the same approve endpoint directly with the typed keyword.

If `workspace.crisisAware === false`, this entire section does not render — consistent with the original ask ("only shown if the crisis aware toggle is on"). Approved/suggested data isn't deleted when the toggle is off, just not surfaced; turning it back on shows everything exactly as it was.

**New component:** `components/lyra/brand/crisis-keywords-section.tsx`

---

## Error Handling

- Keyword-suggestion Claude call failing during a Brand AI build: logged, build continues, no new suggestions added this round (existing suggestions/active keywords untouched).
- Approve/dismiss/remove: standard `requireAuth()` + workspace-access-check pattern already used by every other route in the app; malformed/missing keyword returns 400.
- Duplicate approve (keyword already exists as an active guardrail): treat as a no-op success rather than erroring — avoids a confusing error if the user double-clicks Approve or manually adds something already active.

---

## Scope Boundaries

- **Email notification on crisis trigger is out of scope** — separate spec, to be brainstormed next.
- No editing an already-approved keyword's text — remove and re-add instead. Keeps the CRUD surface small.
- No limit enforced on how many active keywords a workspace can have (AI suggests 5-10, but manual add is uncapped) — not a real-world concern at this scale, no need to build a cap pre-emptively.
- No retroactive re-check of already-open comments against newly-approved keywords — matches how `Guardrail` keyword matching already only applies going forward from a comment's ingestion moment, not backfilled.
- No changes to `SENTIMENT_SPIKE` detection or its still-open limitation (webhook path can't reach it, needs the polling cron) — unrelated to this spec.

---

## Files Created / Modified

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `suggestedCrisisKeywords Json?` to `BrandProfile` |
| `services/brand-intelligence/crisis-keyword-suggester.ts` | New — Claude call for keyword suggestions |
| `app/api/brand-intelligence/build/route.ts` | Modified — call the suggester when `crisisAware` is true, merge results into `suggestedCrisisKeywords` |
| `app/api/brand-intelligence/crisis-keywords/approve/route.ts` | New |
| `app/api/brand-intelligence/crisis-keywords/dismiss/route.ts` | New |
| `app/api/guardrails/[id]/route.ts` | New — `DELETE` only |
| `components/lyra/brand/crisis-keywords-section.tsx` | New |
| `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` | Modified — fetch active guardrails, render the new section when `crisisAware` |
