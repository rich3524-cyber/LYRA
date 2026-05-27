# Pre-Publish Content Scoring — Design Spec

**Date:** 2026-05-25  
**Priority:** 4  
**Status:** Approved for implementation

---

## Overview

A slide-out panel in the post composer scores content in near-real-time as the user types. Claude evaluates six dimensions and returns a score (1–10) plus one specific, actionable suggestion for any dimension scoring below 7. The panel is a coach — not a gatekeeper. Users can ignore it and publish at any time.

**Available on:** All plans (Starter, PRO, AGENCY)  
**Trigger:** Debounced 1.5s after the user stops typing in the composer  
**Position:** Slide-out panel from the right side of the composer, toggled by a "Score" button in the toolbar

---

## Scoring Dimensions

| Dimension | What Claude Evaluates |
|---|---|
| Hook | Does the opening line compel the reader to keep reading? |
| Clarity | Is the message immediately understandable? |
| CTA | Is there a clear call to action? |
| Length | Is the length appropriate for the target platform? |
| Hashtags | Are hashtags relevant, correctly placed, and not over-used? |
| Emotional resonance | Does the content evoke a feeling or connection? |

Each dimension returns:
- `score: number` — 1 to 10
- `suggestion: string | null` — one specific improvement if score < 7, null otherwise

---

## API Endpoint

### `POST /api/ai/score-content`

**Auth:** `requireAuth()` — no plan gate, available on all plans

**Body:**
```typescript
{
  content: string      // post body text
  platform: string     // e.g. "INSTAGRAM" — used to calibrate length and hashtag expectations
  workspaceId: string  // for workspace access check only — no brand profile used in this version
}
```

**Response:**
```typescript
{
  overallScore: number  // average of six dimension scores, rounded to 1 decimal
  dimensions: {
    hook:               { score: number; suggestion: string | null }
    clarity:            { score: number; suggestion: string | null }
    cta:                { score: number; suggestion: string | null }
    length:             { score: number; suggestion: string | null }
    hashtags:           { score: number; suggestion: string | null }
    emotionalResonance: { score: number; suggestion: string | null }
  }
}
```

**Error:** If Claude fails, return `{ error: 'Scoring unavailable' }` with status 503. The UI hides the panel on this error — not a blocking error.

---

## Content Scorer Service (`services/ai/content-scorer.ts`)

```typescript
export async function scoreContent(
  content: string,
  platform: string
): Promise<ScoringResult>
```

Single Claude call. Prompt asks Claude to return valid JSON matching the `ScoringResult` shape. Use `JSON.parse()` on the response — if parsing fails, throw so the API route returns 503.

Platform-specific length guidance in the prompt:
- INSTAGRAM: 150–300 chars ideal
- LINKEDIN: 600–1200 chars ideal
- TWITTER: under 280 chars
- FACEBOOK: 80–500 chars
- TIKTOK: short teaser, 100–150 chars
- GOOGLE_BUSINESS: 300–500 chars

---

## UI

### Composer Toolbar Button

Add a "Score" button (`Sparkles` icon from Lucide) to the right side of the post composer toolbar, adjacent to the character count. Clicking it opens/closes the score panel.

### Score Panel (`components/lyra/composer/content-score-panel.tsx`)

Slide-out panel anchored to the right of the composer. Width: 280px. Uses Framer Motion slide-in from right (translateX 100% → 0, 200ms).

**Panel states:**

1. **Idle (no content):** "Start typing to score your content." in `text-tertiary`.

2. **Scoring (debounce active or request in-flight):** Show shimmer skeleton for the score area. A subtle `text-secondary` label: "Scoring…"

3. **Results:** 
   ```
   Overall  [Score ring]  7.4
   
   Hook              8  ●●●●●●●●○○
   Clarity           9  ●●●●●●●●●○
   CTA               5  ●●●●●○○○○○  ← suggestion below
   Length            8  ●●●●●●●●○○
   Hashtags          6  ●●●●●●○○○○  ← suggestion below
   Emotional res.    7  ●●●●●●●○○○
   
   [CTA suggestion text]
   [Hashtags suggestion text]
   ```

**Score ring:** A circular progress ring around the overall score number. Ring colour:
- 8–10: `status-success` (#4ade80)
- 6–7: `status-warning` (#fbbf24)
- 1–5: `status-error` (#f87171)

**Dimension bars:** 10 dots, filled = scored value. Same colour mapping as ring.

**Suggestions:** Below the dimension grid, list only the suggestions for dimensions that scored < 7. Each suggestion shown in `text-secondary` at 12px, preceded by the dimension name in `text-primary` at 12px medium weight.

---

## Debounce Logic

In the composer component:
- On content change, reset a 1.5s debounce timer
- On timer fire, POST to `/api/ai/score-content` with current content + platform
- While request is in-flight, show skeleton state
- On response, update score state
- If content clears entirely (length < 10), reset score state to idle

Only fire when the score panel is open — skip the API call if panel is closed.

---

## Integration into Composer

Modify `components/lyra/composer/post-composer.tsx`:

1. Add `scoreOpen: boolean` state, toggled by the Score toolbar button
2. Add `scoringResult` state (null | ScoringResult)
3. Add `isScoring: boolean` state
4. Add debounced effect watching `content` (fires only when `scoreOpen`)
5. Render `<ContentScorePanel>` conditionally alongside the composer

---

## Scope Boundaries

- No brand profile integration in this version — generic scoring only
- No score history or trend tracking
- No blocking publish — purely advisory
- No per-platform scoring variation beyond length calibration
- Platform is the primary selected platform in the composer (first in list)

---

## Files Created / Modified

| File | Action |
|---|---|
| `services/ai/content-scorer.ts` | New — Claude scoring call |
| `app/api/ai/score-content/route.ts` | New — POST endpoint |
| `components/lyra/composer/content-score-panel.tsx` | New — slide-out panel |
| `components/lyra/composer/post-composer.tsx` | Modified — add Score button + panel integration |
