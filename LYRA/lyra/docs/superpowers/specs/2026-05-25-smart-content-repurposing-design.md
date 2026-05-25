# Smart Content Repurposing — Design Spec

**Date:** 2026-05-25  
**Priority:** 5  
**Status:** Approved for implementation

---

## Overview

A "Repurpose content" entry point (accessible from the sidebar or calendar page) lets users paste a blog post URL or long-form text. They select target platforms, and LYRA generates platform-native post versions for each. Output feeds directly into the existing schedule review page — same flow, same UX, zero new review infrastructure.

**Available on:** All plans  
**Entry points:** Sidebar nav item ("Repurpose") + "Repurpose" button on calendar page  
**Output:** Posts flow into `/workspace/[id]/schedule/review` via the existing `lyra:schedule-review:<workspaceId>` sessionStorage key

---

## Repurpose Page (`app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx`)

Single-page UI. No modal, no dialog — a full page in the workspace nav.

**Layout:**
```
"Repurpose Content"  [display heading]

Source
[  Paste URL or long-form text ▼  ]   (textarea, 6 rows)
[ URL ]  [ Text ]  (toggle — URL fetches + extracts, Text uses as-is)

Platforms
[ Facebook ] [ Instagram ] [ LinkedIn ] [ Twitter ] [ TikTok ] [ Google Business ]
(same pill-style toggles as schedule generator)

[ Repurpose → ]  button
```

URL mode: When the user pastes a URL and clicks Repurpose, the server fetches and extracts the article text server-side (same Cheerio scraper with SSRF protections). Text mode: content is used directly.

---

## API Endpoint

### `POST /api/ai/repurpose`

**Auth:** `requireAuth()` + workspace access check  
**No plan gate** — available on all plans

**Body:**
```typescript
{
  workspaceId: string
  sourceType: 'url' | 'text'
  source: string          // URL string or raw text body
  platforms: string[]     // e.g. ['INSTAGRAM', 'LINKEDIN', 'TWITTER']
}
```

**Response (streaming SSE):**

Uses the same SSE pattern as the schedule generator. Streams one post at a time as Claude generates them:

```
data: {"type":"post","platform":"INSTAGRAM","content":"..."}
data: {"type":"post","platform":"LINKEDIN","content":"..."}
data: {"type":"done","total":3}
```

**Server-side flow:**
1. If `sourceType === 'url'`: fetch URL with SSRF protection, extract article body via Cheerio
2. Call Claude with article content + platform list, request one post per platform
3. Stream each post back as it completes

**Error:** If URL fetch fails (404, timeout, SSRF block), return `{ error: 'Could not fetch that URL.' }` with status 422 before streaming starts.

---

## Content Repurposer Service (`services/ai/content-repurposer.ts`)

```typescript
export async function repurposeContent(
  sourceText: string,
  platforms: string[]
): Promise<AsyncIterable<{ platform: string; content: string }>>
```

Single Claude call with all platforms in one prompt. Claude is instructed to return posts sequentially, one per platform, in a structured format that the streamer can parse and emit. `max_tokens: 3000` (covers ~6 platforms at 200–400 tokens each).

Platform-native guidance in the prompt (same length/style notes as content scorer):
- Instagram: visual hook + 150–300 chars + 3–5 hashtags
- LinkedIn: professional tone, 600–1200 chars, no hashtags
- Twitter: punchy, under 280 chars, 1–2 hashtags max
- Facebook: conversational, 80–500 chars
- TikTok: hook-first teaser, 100–150 chars
- Google Business: local/professional, 300–500 chars

---

## Repurpose UI Component (`components/lyra/repurpose/repurpose-form.tsx`)

Client component. States:

1. **Idle:** Form as described above
2. **Generating:** Progress indicator — "Generating [platform] version…" as each post streams in. Same shimmer skeleton cards as schedule generator.
3. **Complete:** Brief "3 posts generated" message — then automatically writes to sessionStorage and navigates to `/workspace/${workspaceId}/schedule/review`.

**sessionStorage write:** Uses the exact same key and shape as the schedule generator:
```typescript
sessionStorage.setItem(
  `lyra:schedule-review:${workspaceId}`,
  JSON.stringify(posts)  // PostEntry[] — same type as schedule generator output
)
```

`PostEntry` for repurposed posts:
```typescript
{
  id: crypto.randomUUID(),
  platform: platform,      // e.g. 'INSTAGRAM'
  content: generatedText,
  scheduledAt: '',         // empty — user sets date on review page
  weekNum: 0,              // 0 = no week grouping
  mediaUrls: [],
  uploadingMedia: false,
}
```

The review page already handles empty `scheduledAt` — user sets the date inline before adding to calendar.

---

## Sidebar Navigation

Add "Repurpose" to `components/lyra/app-shell/sidebar.tsx`:
- Icon: `Scissors` from Lucide
- Position: below "Competitors" in the workspace nav (or below "Brand" if Competitors not yet built)
- Available on all plans — no gate

---

## URL Extraction

Reuses the existing Cheerio scraper pattern from `services/brand-intelligence/scraper.ts`. Extract:
- `<article>` body text if present
- Otherwise fall back to `<main>` > `<p>` tags
- Strip all HTML, collapse whitespace
- Truncate to 8000 chars (enough for any blog post, stays within Claude context)

SSRF protections from `scraper.ts` must be reused — block RFC1918, loopback, and link-local addresses.

---

## Scope Boundaries

- One source → multiple platform posts (no multi-source in this version)
- No brand voice integration in this version — plain platform-native generation
- Scheduled dates are blank — user fills them on the review page
- No media suggestions — media attach on review page as usual
- No saving of repurpose history — posts exist only in sessionStorage until saved to calendar

---

## Files Created / Modified

| File | Action |
|---|---|
| `services/ai/content-repurposer.ts` | New — Claude generation + streaming |
| `app/api/ai/repurpose/route.ts` | New — POST endpoint with SSE streaming |
| `components/lyra/repurpose/repurpose-form.tsx` | New — full repurpose UI |
| `app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx` | New — page wrapper |
| `components/lyra/app-shell/sidebar.tsx` | Modified — add Repurpose nav item |
