# Automated Agency Client Reports — Design Spec

**Date:** 2026-05-25  
**Priority:** 2  
**Status:** Approved for implementation

---

## Overview

A "Generate report" button on the analytics page lets PRO and AGENCY users create a branded PDF performance report for any workspace. The user picks 7-day or 30-day. LYRA queries the DB, calls Claude for an AI-written narrative, and streams the PDF back as a download. No new page required — one button, one modal, one download.

**Available on:** PRO and AGENCY plans  
**Library:** `@react-pdf/renderer` (not puppeteer — too heavy for Netlify serverless)

---

## Report Structure

```
1. Cover page
   - LYRA logo (platinum on near-black)
   - Workspace name
   - Report period ("Last 7 days" / "Last 30 days")
   - Generated date

2. Executive Summary
   - Total posts published
   - Total impressions
   - Total engagements
   - Average engagement rate
   - Best-performing platform

3. Platform Breakdown
   - One row per connected platform: posts, impressions, engagements, eng rate

4. Top 3 Posts
   - Platform badge, scheduled date, content excerpt (120 chars), key metrics

5. AI Narrative
   - 2–3 paragraph performance summary written by Claude
   - References actual numbers: "LinkedIn drove 42% of total engagement this period"
   - Tone: professional, direct, no fluff — LYRA voice
```

---

## Data Sources

All data comes from the existing DB — no live platform API calls at report generation time.

- `Post` where `workspaceId = X`, `status = PUBLISHED`, `scheduledAt >= periodStart`
- `PostMetrics` joined to posts — `impressions`, `engagements`, `clicks`, `reach`
- `SocialAccount` for platform display names

If `PostMetrics` is empty for a post, that post is excluded from metric totals (not counted as zero).

---

## API Endpoint

### `POST /api/reports/generate`

**Auth:** `requireAuth()` + workspace access check + plan gate (PRO/AGENCY only)

**Body:**
```typescript
{
  workspaceId: string
  period: '7d' | '30d'
}
```

**Response:** `Content-Type: application/pdf` — streams PDF bytes directly.

**Server-side flow:**
1. Query posts + metrics for the period
2. Aggregate stats per platform
3. Sort posts by engagement desc, take top 3
4. Build Claude prompt with all stats, call Claude for narrative (max_tokens: 600)
5. Render PDF using `@react-pdf/renderer` server-side
6. Return PDF buffer

---

## PDF Rendering (`services/reports/report-renderer.ts`)

Uses `@react-pdf/renderer` `renderToBuffer()` — runs on the server, returns a `Buffer`.

```typescript
export async function renderReport(data: ReportData): Promise<Buffer>
```

`ReportData` type:
```typescript
type ReportData = {
  workspaceName: string
  period: '7d' | '30d'
  generatedAt: string
  summary: { totalPosts: number; totalImpressions: number; totalEngagements: number; avgEngRate: number; bestPlatform: string }
  platforms: { platform: string; posts: number; impressions: number; engagements: number; engRate: number }[]
  topPosts: { platform: string; scheduledAt: string; contentExcerpt: string; impressions: number; engagements: number }[]
  narrative: string
}
```

**Design tokens in PDF:**
- Background: `#080808` for cover, `#0f0f0f` for content pages
- Text: `#e2e2e2` primary, `#888888` secondary
- Accent: `#d8d8d8` for headings and highlights
- Font: PDF-safe equivalents — Helvetica for sans, Courier for mono data

---

## Narrative Generation (`services/reports/narrative-generator.ts`)

```typescript
export async function generateNarrative(data: ReportData): Promise<string>
```

Prompt includes all stats as a structured summary. Claude returns 2–3 paragraphs of professional analysis. If Claude fails (timeout / error), `narrative` is set to empty string and the PDF is generated without it (graceful degradation).

---

## UI

### Analytics Page Changes (`app/(dashboard)/workspace/[workspaceId]/analytics/page.tsx`)

Add a "Generate report" button to the page header, adjacent to the existing date range controls.

### Report Modal (`components/lyra/analytics/report-generator-modal.tsx`)

Simple modal with:
- "Last 7 days" / "Last 30 days" toggle (same pattern as schedule generator duration)
- "Generate PDF" button — shows spinner while loading, triggers download on success
- Error state if generation fails

No new route — modal lives on the analytics page. On success, `window.open(URL.createObjectURL(blob))` or use a hidden `<a download>` link.

---

## Plan Gating

```typescript
// In POST /api/reports/generate
const workspace = await prisma.workspace.findFirst({ ... })
if (!workspace) return 404
const plan = workspace.plan // 'STARTER' | 'PRO' | 'AGENCY'
if (plan === 'STARTER') return 403 { error: 'Reports require PRO or AGENCY plan' }
```

---

## Scope Boundaries

- No scheduled auto-delivery in this version — on-demand only
- No white-label client branding — LYRA branding only
- No CSV export — PDF only
- No caching of generated reports — regenerated each time
- Monthly auto-send to client email is Phase 3

---

## Files Created / Modified

| File | Action |
|---|---|
| `services/reports/report-renderer.ts` | New — `@react-pdf/renderer` PDF builder |
| `services/reports/narrative-generator.ts` | New — Claude narrative paragraph |
| `app/api/reports/generate/route.ts` | New — POST endpoint |
| `components/lyra/analytics/report-generator-modal.tsx` | New — modal UI |
| `app/(dashboard)/workspace/[workspaceId]/analytics/page.tsx` | Modified — add Generate report button |
| `package.json` | Add `@react-pdf/renderer` dependency |
