# AI Content Schedule — Design Spec

**Date:** 2026-05-19
**Status:** Approved for implementation

---

## Overview

Two related features, built in three sequential phases:

1. **Post Now button** — immediate publish from the Compose section (Phase 1, small)
2. **AI Schedule Generator** — generate a 3 or 6 week content calendar using the brand profile (Phase 2, text-only captions + hashtags)
3. **Media Library + AI media matching** — upload brand assets, AI tags by topic, attaches to generated posts (Phase 3, enhancement to Phase 2)

---

## Phase 1: Post Now Button

### What it does
Adds a "Post Now" button alongside the existing "Schedule" button in the Compose section. Instead of requiring a scheduled date/time, the post is created with `scheduledAt = now` and `status = SCHEDULED`, making it eligible for immediate pickup by the post-publishing worker.

### Design decisions
- The button sits next to "Schedule post" in the composer footer
- Requires at least one platform to be selected
- Same validation as scheduling (caption required)
- After clicking, shows the same confirmation as scheduled posts — no separate flow needed
- No new API route required: the existing POST `/api/posts` route handles it — caller just sends `scheduledAt: new Date().toISOString()`

### Files affected
- `components/lyra/composer/post-composer.tsx` — add Post Now button

---

## Phase 2: AI Schedule Generator (text-only)

### What it does
After a brand profile has been built, users can generate a full content schedule for 3 or 6 weeks across their connected social platforms. The AI produces a caption and hashtag set for every post, drawing on the brand's voice, tone attributes, and content themes from the brand profile. Posts are generated as DRAFT status in the content calendar, ready to edit or approve.

### Prerequisites
- Brand profile must exist (`workspace.brandProfile !== null`)
- At least one active social account connected
- The feature is gated behind this check — if either condition fails, the UI shows a prompt to complete setup first

### User flow

```
Calendar page
  └─ "Generate schedule" button (shown when brand profile exists)
       └─ Config panel (modal or sidebar panel)
            ├─ Duration: 3 weeks / 6 weeks (toggle)
            ├─ Platforms: checkbox per connected platform
            └─ Posts per week: number stepper per selected platform (1–7, default 3)
                 └─ "Generate" button
                      └─ Generation progress screen
                           └─ Review screen (list of all posts, grouped by week)
                                ├─ Edit individual post (inline or slide-out)
                                ├─ Delete individual post
                                └─ "Add to calendar" button
                                     └─ All posts land in calendar as DRAFT
```

### Config panel
- **Duration:** radio toggle — 3 weeks or 6 weeks
- **Platforms:** one checkbox row per connected platform (pre-ticked, user can untick)
- **Posts per week:** number input per platform, min 1 max 7, default 3
- Total post count shown: e.g. "42 posts across 3 platforms over 6 weeks"
- "Generate" button disabled if no platforms selected

### Generation
- API route: `POST /api/schedule/generate`
- Request body: `{ workspaceId, durationWeeks: 3 | 6, platforms: Record<Platform, number> }`
- Server reads the workspace's brand profile: `contentThemes`, `voiceSummary`, `toneAttributes`, `audiencePersona`
- Single Claude call generates the full schedule plan as structured JSON:
  ```json
  [
    {
      "platform": "INSTAGRAM",
      "topic": "Behind the scenes at our workshop",
      "scheduledAt": "2026-05-26T09:00:00Z",
      "caption": "...",
      "hashtags": ["#craftwork", "#handmade", "..."]
    },
    ...
  ]
  ```
- Claude distributes posts across the week at sensible times per platform (Instagram: 9am/12pm/6pm; LinkedIn: Tue/Thu 8am; Facebook: 10am/3pm; etc.)
- Topics are drawn from `brandProfile.contentThemes` — no two consecutive posts on the same platform share the same topic
- Response streams via Server-Sent Events so the UI can show a real-time progress bar as posts are generated week by week

### Review screen
- Full-page view (or large modal), not the calendar
- Posts grouped by week, then by day
- Each post row shows:
  - Platform icon
  - Scheduled day + time
  - Caption preview (truncated at 120 chars, expandable)
  - Hashtag chips
  - Edit button — opens inline edit panel with full caption + hashtag editing
  - Delete button — removes that post from the pending batch
- Footer: "X posts across Y platforms" count + "Add all to calendar" CTA
- "Add all to calendar" creates all remaining posts in the DB with `status = DRAFT`
- User returns to the calendar where all posts appear as editable drafts

### API routes
- `POST /api/schedule/generate` — runs generation, returns SSE stream
- No additional routes needed — posts are created via the existing `POST /api/posts` route in bulk after review

### Database
No schema changes required. Posts use the existing `Post` model with:
- `status: DRAFT`
- `scheduledAt`: AI-assigned time
- `platform`: per post
- `content`: caption + hashtags combined

### Generation gating
- Blocked on Starter plan (no brand intelligence on Starter)
- Available on Pro and Agency plans

---

## Phase 3: Media Library (future enhancement)

### What it does
A dedicated media library within each workspace where users upload photos and videos. Each uploaded asset is AI-tagged with relevant topics (drawn from the brand profile's content themes). When Phase 2's schedule generator runs, it auto-attaches the best-matching media asset to each post based on topic alignment.

### Key design decisions (for future spec)
- Storage: AWS S3 (already wired up via `lib/s3.ts`)
- AI tagging: Claude reads the image (or video thumbnail) and assigns topic tags from the brand profile's `contentThemes`
- Media picker: accessible from both the AI schedule review screen and the individual post composer
- Posts without a matching asset are flagged in the review screen so the user knows to add one manually
- This phase does not change the Phase 2 flow — it enhances it. The schedule generator gains an optional `attachMedia: boolean` toggle in the config panel once Phase 3 is shipped.

---

## Build order

| Phase | Feature | Effort | Shipped when |
|-------|---------|--------|--------------|
| 1 | Post Now button | ~2 hours | Next session |
| 2 | AI Schedule Generator (text-only) | ~2 weeks | After Phase 1 |
| 3 | Media Library + AI matching | ~2 weeks | After Phase 2 |

---

## What this is NOT

- This is not a fully autonomous system that posts without human review. Every generated post lands as DRAFT. Scheduling only happens when the user clicks "Add to calendar" from the review screen.
- This is not a social listening or trending-topics tool. Topics come entirely from the brand profile.
- Phase 2 does not attach media automatically — that is Phase 3.
