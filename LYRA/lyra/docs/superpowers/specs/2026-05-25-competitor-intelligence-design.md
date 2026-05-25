# Competitor Intelligence — Design Spec

**Date:** 2026-05-25  
**Priority:** 3  
**Status:** Approved for implementation

---

## Overview

Users add competitor social handles and blog/website URLs to a workspace. A daily background job monitors those competitors — scraping their blogs and fetching available public post data. Results surface on a new Competitors page within the workspace, showing posting frequency, recent content themes, and engagement benchmarks. PRO+ only.

**Available on:** PRO and AGENCY plans  
**Data sources:** Blog/website (Cheerio scraper), Twitter/X public posts (if API key configured), Facebook public pages (via Graph API)  
**Not feasible without auth:** Instagram, TikTok, LinkedIn competitor data

---

## Data Model

```prisma
model Competitor {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  name        String
  websiteUrl  String?
  twitterHandle String?
  facebookPageId String?
  createdAt   DateTime  @default(now())
  snapshots   CompetitorSnapshot[]
}

model CompetitorSnapshot {
  id           String     @id @default(cuid())
  competitorId String
  competitor   Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)
  capturedAt   DateTime   @default(now())
  postsPerWeek Float?     // estimated from recent activity
  recentTopics String[]   // Claude-extracted content themes
  engagementBenchmark Float? // avg engagements per post if available
  recentPosts  Json?      // last 5 posts: [{date, excerpt, url, platform}]
}
```

---

## Worker (`workers/competitor-monitor.worker.ts`)

Runs daily via BullMQ. For each workspace with `plan = PRO | AGENCY`:
1. Fetch all `Competitor` records for workspace
2. For each competitor:
   a. Scrape website/blog with Cheerio (if `websiteUrl` set) — extract latest 5 post titles/excerpts
   b. Fetch Twitter public timeline (if `twitterHandle` set and Twitter API key configured)
   c. Fetch Facebook public page posts (if `facebookPageId` set and Facebook token available)
3. Call Claude to extract content themes from combined content
4. Save `CompetitorSnapshot`

Rate limit: max 10 competitors per workspace, max 20 requests per competitor per day.

---

## Competitor Monitor Service (`services/competitors/competitor-scraper.ts`)

```typescript
export async function scrapeCompetitor(competitor: Competitor): Promise<CompetitorData>
```

Returns:
```typescript
type CompetitorData = {
  recentPosts: { date: string; excerpt: string; url?: string; platform: string }[]
  postsPerWeek: number
  engagementBenchmark: number | null
}
```

Uses existing `scraper.ts` Cheerio patterns from brand intelligence. SSRF protections (block RFC1918, loopback) must apply here too.

---

## Theme Extraction (`services/competitors/theme-extractor.ts`)

```typescript
export async function extractThemes(posts: string[]): Promise<string[]>
```

Single Claude call: given recent post excerpts, return 3–5 content themes as short phrases. Example: `["product launches", "behind the scenes", "customer testimonials"]`.

---

## API Endpoints

### `GET /api/competitors?workspaceId=`
Returns competitor list with latest snapshot for each.

### `POST /api/competitors`
```typescript
{ workspaceId: string; name: string; websiteUrl?: string; twitterHandle?: string; facebookPageId?: string }
```
Creates competitor. Max 10 per workspace enforced here.

### `DELETE /api/competitors/[id]`
Deletes competitor + all snapshots.

---

## Competitors Page (`app/(dashboard)/workspace/[workspaceId]/competitors/page.tsx`)

Accessible from workspace sidebar (new nav item, PRO+ gated with lock icon on Starter).

**Layout:**
```
Header: "Competitor Intelligence"   [+ Add Competitor] button

[Competitor Card]
Name + domains listed
Posts/week: ~4.2     Last scanned: 2 days ago
Themes: product launches · customer stories · tutorials
Recent posts: [last 3 post excerpts with dates]
[Remove]
```

Empty state: "No competitors added. Add a competitor to start tracking their content strategy."

Add form: simple slide-over or inline form — name, website URL, Twitter handle, Facebook page ID. No OAuth required.

---

## Sidebar Navigation

Add "Competitors" link to `components/lyra/app-shell/sidebar.tsx`:
- Icon: `Crosshair` from Lucide
- Position: below "Brand" in the workspace nav
- Plan gate: visible but with lock icon on Starter; full access on PRO/AGENCY

---

## Scope Boundaries

- Max 10 competitors per workspace
- Website scraping only — no API-authenticated competitor data in this version
- Twitter API key optional — if not configured, skip Twitter monitoring silently
- No competitor alerts — user checks the page manually
- No historical trend charts — just latest snapshot + snapshot archive list
- Integration into monthly reports is Phase 3

---

## Files Created / Modified

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `Competitor` and `CompetitorSnapshot` models |
| `services/competitors/competitor-scraper.ts` | New |
| `services/competitors/theme-extractor.ts` | New |
| `workers/competitor-monitor.worker.ts` | New |
| `workers/index.ts` | Modified — register competitor monitor worker |
| `app/api/competitors/route.ts` | New — GET list, POST create |
| `app/api/competitors/[id]/route.ts` | New — DELETE |
| `app/(dashboard)/workspace/[workspaceId]/competitors/page.tsx` | New |
| `components/lyra/competitors/competitor-card.tsx` | New |
| `components/lyra/competitors/add-competitor-form.tsx` | New |
| `components/lyra/app-shell/sidebar.tsx` | Modified — add Competitors nav item |
