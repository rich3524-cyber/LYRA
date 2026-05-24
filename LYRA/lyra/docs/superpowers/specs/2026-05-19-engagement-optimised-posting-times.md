# Engagement-Optimised Posting Times — Design Spec

**Date:** 2026-05-19  
**Status:** Approved for implementation

---

## Overview

LYRA analyses each workspace's historical post engagement to determine optimal posting windows per platform and per content topic. These patterns replace the hardcoded default time slots in the AI schedule generator, surface as hints in the post composer, and are visualised as an engagement heat map on the brand intelligence page.

No competitor does this at a per-client, per-topic level. Buffer and Hootsuite offer generic industry-average "best times" — LYRA uses the workspace's own performance data, correlated with content theme.

---

## Prerequisites

- Published posts with non-zero `PostMetrics` (likes, comments, shares, saves, clicks) — populated by the metrics sync cron once Railway workers are deployed and platform API access is granted
- `BrandProfile` exists for the workspace (already required for AI schedule generation)

The feature degrades gracefully when data is absent: hardcoded defaults are used silently and the insights panel shows a data threshold progress bar instead of the heat map.

---

## Section 1: Data Model

### Schema change — `Post.topic`

Add one optional field to the `Post` model:

```prisma
topic String?
```

Stores the content theme for AI-generated posts (e.g. "behind the scenes", "product showcase"). Set at post creation time when the post originates from the AI schedule generator. Manual posts leave it null. No other model changes required.

### `BrandProfile.postingPatterns` (existing field)

The `postingPatterns Json?` field already exists on `BrandProfile`. It will be populated by the engagement analyser with this structure:

```json
{
  "INSTAGRAM": {
    "topSlots": [
      { "dayOfWeek": 5, "hour": 18, "score": 0.94, "sampleSize": 23 },
      { "dayOfWeek": 2, "hour": 12, "score": 0.81, "sampleSize": 18 },
      { "dayOfWeek": 3, "hour": 9,  "score": 0.73, "sampleSize": 15 }
    ],
    "byTopic": {
      "behind the scenes": [
        { "dayOfWeek": 5, "hour": 18, "score": 0.91, "sampleSize": 8 },
        { "dayOfWeek": 1, "hour": 18, "score": 0.74, "sampleSize": 5 }
      ],
      "product showcase": [
        { "dayOfWeek": 2, "hour": 12, "score": 0.88, "sampleSize": 6 }
      ]
    },
    "totalPostsAnalyzed": 47,
    "analyzedAt": "2026-05-19T06:00:00Z"
  },
  "LINKEDIN": { ... }
}
```

`dayOfWeek` follows JavaScript convention: 0 = Sunday, 1 = Monday … 6 = Saturday.  
`score` is normalised 0–1 relative to the best-performing slot for that platform.  
`sampleSize` is the number of posts that contributed to that slot's score.

### Engagement score formula

```
score = (likes × 1) + (comments × 3) + (shares × 2) + (saves × 2) + (clicks × 1)
```

Weighted by interaction depth — a comment signals far more intent than a like. Raw scores are normalised per platform so the top slot always equals 1.0.

### Activation thresholds

| Level | Minimum posts required |
|---|---|
| Platform-level top slots | 20 published posts with non-zero metrics per platform |
| Topic-level correlation | 10 published posts per topic per platform |

Slots with fewer than 5 contributing posts are excluded from results regardless of score. Topic entries with fewer than 5 posts are omitted from `byTopic`.

---

## Section 2: Engagement Analysis Service

### File

`services/ai/engagement-analyzer.ts`

### Function signature

```typescript
export async function analyzeEngagement(
  workspaceId: string
): Promise<PostingPatterns | null>
```

Returns `null` if no platform meets the 20-post threshold.

### Algorithm

1. Query all `PUBLISHED` posts for the workspace with `PostMetrics` where at least one metric field is non-zero
2. For each post, extract `dayOfWeek` and `hour` from `publishedAt`
3. Compute the weighted engagement score per post
4. Group by `platform → { dayOfWeek, hour }` → sum scores, track sample size
5. Normalise scores per platform (divide by max score for that platform)
6. Take top 5 slots per platform (minimum sampleSize ≥ 5)
7. Repeat steps 3–6 grouped by `platform → topic → { dayOfWeek, hour }` for posts where `topic` is non-null
8. Take top 3 slots per topic (minimum sampleSize ≥ 5)
9. Exclude entire platform from output if `totalPostsAnalyzed < 20`
10. Exclude topic entries from `byTopic` if `sampleSize < 10` across all slots for that topic
11. Return the assembled `PostingPatterns` object with `analyzedAt: new Date()`

Pure database work — no AI calls, no external APIs.

### TypeScript types

```typescript
export type PostingSlot = {
  dayOfWeek: number   // 0–6
  hour: number        // 0–23
  score: number       // 0–1
  sampleSize: number
}

export type PlatformPattern = {
  topSlots: PostingSlot[]
  byTopic: Record<string, PostingSlot[]>
  totalPostsAnalyzed: number
  analyzedAt: string
}

export type PostingPatterns = Record<string, PlatformPattern>
```

### Trigger: automatic

`app/api/cron/brand-refresh/route.ts` calls `analyzeEngagement(workspaceId)` at the end of each weekly brand refresh. If the result is non-null, it writes it to `brandProfile.postingPatterns`. No new cron needed.

### Trigger: manual

New endpoint: `POST /api/brand-intelligence/analyze-engagement`

- Authenticates via `requireAuth()`
- Verifies workspace ownership (`access: { some: { userId: user.id } }`)
- Calls `analyzeEngagement(workspaceId)`
- Writes result to `brandProfile.postingPatterns` if non-null
- Returns `{ postingPatterns }` so the UI updates without a page reload

---

## Section 3: Schedule Generator Integration

### `services/ai/schedule-generator.ts`

`generateWeekPosts` gains an optional `postingPatterns` parameter:

```typescript
export async function generateWeekPosts(
  brand: BrandContext,
  weekNumber: number,
  weekStartDate: Date,
  platforms: Record<string, number>,
  postingPatterns?: PostingPatterns,
): Promise<GeneratedPost[]>
```

When `postingPatterns` is provided, the hardcoded time slot block in the Claude prompt is replaced with the workspace's real data:

```
Optimal posting times (based on this workspace's engagement data):
- INSTAGRAM top slots: Fri 18:00 (score 0.94), Tue 12:00 (score 0.81), Wed 09:00 (score 0.73)
- INSTAGRAM — "behind the scenes": Fri 18:00 (score 0.91), Mon 18:00 (score 0.74)
- INSTAGRAM — "product showcase": Tue 12:00 (score 0.88)

Instructions:
- For each post, prefer the highest-scoring slot that matches the post's topic if byTopic data exists
- Fall back to the platform topSlots if no topic match is available
- Distribute posts to avoid scheduling two posts in the same slot on the same platform
```

When `postingPatterns` is absent or a platform has no pattern data, the existing hardcoded defaults run unchanged.

### `app/api/schedule/generate/route.ts`

The existing Prisma query already includes `brandProfile`. Add `postingPatterns: true` to the select and pass it to `generateWeekPosts`. No extra DB call.

### `app/api/posts/route.ts`

Accept an optional `topic` field in the POST body. Store it on the created `Post`. The `schedule-generator.tsx` component passes `post.topic` for each AI-generated post when saving to the calendar.

---

## Section 4: Composer Hints

### Location

Inside `components/lyra/composer/post-composer.tsx`, below the existing schedule date/time picker.

### Behaviour

When one or more platforms are selected and `postingPatterns` has data for any selected platform, a subtle hint line appears:

```
Best times for Instagram: Fri 6pm · Tue 12pm · Wed 9am
```

Each time is a clickable chip that sets the schedule picker to that day in the current week at that hour.

**Three states:**

| State | Display |
|---|---|
| Data available | "Best times for [platform]: [slot] · [slot] · [slot]" |
| Below threshold | "Publish more posts to unlock timing insights for [platform]" |
| No platform selected | Hidden |

When multiple platforms are selected, show hints for each platform on a separate line.

### Data source

`app/(dashboard)/workspace/[workspaceId]/compose/page.tsx` already fetches workspace data. Add `brandProfile: { select: { postingPatterns: true } }` to the Prisma select and pass it as a prop to `PostComposer`. No new API call.

---

## Section 5: Brand Intelligence Insights Panel

### Location

New section at the bottom of `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx`, rendered only when a brand profile exists.

### Component

`components/lyra/brand/engagement-insights.tsx`

Props: `{ postingPatterns: PostingPatterns | null, connectedPlatforms: string[], postCounts: Record<string, number> }`

`postCounts` is a per-platform count of published posts with non-zero metrics — used to render the progress bar in cold start state.

### Active state (threshold met)

**Platform tabs** — one tab per connected platform that has pattern data. Inactive platforms (below threshold) shown as disabled tabs with their progress.

**Engagement heat map** — rows are time bands 6am–10pm in 1-hour increments, columns are Mon–Sun. Each cell coloured by normalised score:
- Score 0 / no data: `bg-background-tertiary`, text `—`
- Score 0.1–0.4: `bg-background-hover`
- Score 0.4–0.7: `text-accent-silver border-accent-silver`
- Score 0.7–1.0: `bg-background-tertiary border-accent-platinum text-accent-platinum`

**Topic breakdown table** — below the heat map, each content theme and its top 2 slots. Only shown for topics that have met the 10-post threshold.

**Data freshness** — `"Based on N posts · Updated X days ago"` in `text-text-tertiary text-xs`.

**Refresh button** — calls `POST /api/brand-intelligence/analyze-engagement`, updates panel in place, shows loading state on the button during the request.

### Cold start state (below threshold for all platforms)

Replaces the heat map with a per-platform progress bar:

```
Instagram    ████████░░░░  8 of 20 posts
LinkedIn     ████░░░░░░░░  4 of 20 posts
```

Copy below: "LYRA tracks engagement on every published post. Once you reach the threshold, your optimal posting windows appear here automatically."

---

## File Map

### Create
- `services/ai/engagement-analyzer.ts` — analysis algorithm + TypeScript types
- `app/api/brand-intelligence/analyze-engagement/route.ts` — manual trigger endpoint
- `components/lyra/brand/engagement-insights.tsx` — insights panel component

### Modify
- `prisma/schema.prisma` — add `topic String?` to `Post`
- `services/ai/schedule-generator.ts` — accept `postingPatterns`, update prompt
- `app/api/schedule/generate/route.ts` — pass `postingPatterns` to generator
- `app/api/posts/route.ts` — accept and store `topic` field
- `app/api/cron/brand-refresh/route.ts` — call `analyzeEngagement` at end of run
- `components/lyra/composer/post-composer.tsx` — add time hints
- `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx` — pass `postingPatterns` prop
- `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` — render insights panel, pass `postCounts`
- `components/lyra/schedule/schedule-generator.tsx` — pass `topic` when saving posts

---

## What This Is Not

- This does not predict future engagement — it identifies historical patterns only
- This does not modify posts that have already been scheduled
- This does not require any new database models — `Post.topic` and `BrandProfile.postingPatterns` are the only changes
- Topic correlation does not apply to manually composed posts (they have no topic tag)
- The insights panel is read-only — it does not allow the user to manually set preferred times (that is a future enhancement)
