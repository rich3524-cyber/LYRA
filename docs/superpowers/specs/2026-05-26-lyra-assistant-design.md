# LYRA Assistant — Design Spec

**Date:** 2026-05-26
**Status:** Approved — awaiting implementation post-showcase
**Author:** Brainstorming session with Richard Unwin

---

## What It Is

LYRA Assistant is a plan-gated marketing intelligence feature that generates two documents per quarter:

1. **Quarterly Review** — a backward-looking performance report covering the previous 90 days
2. **Next 3 Months Strategy** — a structured forward-looking plan with monthly content pillars, key dates, campaign ideas, and recommended post frequency per platform

Reports are viewable inside LYRA and exportable as a co-branded PDF (client logo + LYRA mark).

---

## Plan Gating

- **STARTER:** Nav item is visible but clicking it routes to an upsell landing page
- **PRO:** Full access
- **AGENCY:** Full access

---

## Navigation

New sidebar item: **"LYRA Assistant"**
- Icon: `Sparkles` (Lucide, strokeWidth 1.5)
- Position: between SEO and the workspace setup counter
- Visible for all plans — STARTER routes to upsell, Pro/Agency routes to report view

---

## Database Schema

### New fields on `Workspace`
```prisma
clientLogoS3Key  String?   // Client logo for PDF co-branding
region           String    @default("AU")  // For key date localisation
```

### New model: `AssistantReport`
```prisma
model AssistantReport {
  id          String               @id @default(cuid())
  workspaceId String
  workspace   Workspace            @relation(fields: [workspaceId], references: [id])
  quarter     String               // "Q2-2026"
  generatedAt DateTime             @default(now())
  status      AssistantReportStatus
  reportData  Json?                // Structured report content
  pdfS3Key    String?              // Cached PDF path — cleared on regeneration
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
}

enum AssistantReportStatus {
  GENERATING
  READY
  FAILED
}
```

### `reportData` JSON shape
```json
{
  "period": {
    "from": "2026-02-01",
    "to": "2026-04-30",
    "label": "Feb–Apr 2026"
  },
  "performance": {
    "totalPosts": 42,
    "avgEngagementRate": 0.034,
    "bestPlatform": "INSTAGRAM",
    "topContentTheme": "Behind the scenes",
    "byPlatform": [
      {
        "platform": "INSTAGRAM",
        "postCount": 18,
        "avgEngagementRate": 0.051,
        "topPostId": "..."
      }
    ],
    "insightNarrative": "AI-generated 3-4 sentence summary"
  },
  "strategy": {
    "months": [
      {
        "month": "May 2026",
        "contentPillars": ["Educational", "Behind the scenes", "Promotions"],
        "keyDates": [
          {
            "date": "2026-05-11",
            "name": "Mother's Day (AU)",
            "campaignIdea": "Gift guide + emotional storytelling series"
          }
        ],
        "recommendedFrequency": [
          { "platform": "INSTAGRAM", "postsPerWeek": 4 },
          { "platform": "FACEBOOK", "postsPerWeek": 3 }
        ]
      }
    ]
  }
}
```

---

## UI Design

### Route
`/workspace/[workspaceId]/assistant`

Server component — checks plan and renders either upsell page or report view.

### Upsell Page (STARTER)
- Same page shell as the rest of the app
- `Lock` icon (Lucide, 24px, text-tertiary)
- Heading: "LYRA Assistant"
- 2–3 sentence description of the feature
- Blurred/dimmed static mockup preview of a report
- Two plan cards: Pro and Agency with feature lists
- Primary CTA: "Upgrade to Pro" → `/account/billing`
- Secondary link: "Learn more about LYRA plans"

### Report View (Pro / Agency)

**Header row**
- Left: "LYRA Assistant" (display heading) + workspace name (subtitle)
- Right: quarter selector dropdown (past reports) + "Export PDF" button + "Generate Report" / "Regenerate" button

**Empty state (no reports)**
- `Sparkles` icon, "No reports generated yet."
- Brief explanation of what LYRA Assistant does
- "Generate Q2 2026 Report" button

**Generating state**
- Inline skeleton (three shimmer blocks) — not the full-screen overlay
- "LYRA is analysing your last quarter. This takes about 30 seconds." below header
- Page remains navigable

**Quarterly Review section**
- Four stat cards (Geist Mono): Total posts, Avg engagement rate, Best platform, Top content theme
- Per-platform rows with expandable top post
- AI-generated insight paragraph (DM Sans body, 3–4 sentences)

**Next 3 Months Strategy section**
- Three stacked month cards
- Each card: month label + content pillars as tags + key dates list with campaign ideas + post frequency table per platform

**Regenerate behaviour**
If a report exists for the current quarter, button reads "Regenerate" with warning: "This will replace the existing Q2 2026 report."

**Version history**
Quarter selector dropdown in header. Past quarters load their stored report. Comparison between quarters is a future enhancement — not in scope for this build.

---

## Workspace Settings — Branding Tab

New tab in workspace Settings: "Branding"

- Client logo upload: PNG, JPG, or SVG (SVG preferred for PDF quality). 2MB limit.
- Uploads to S3, stores `clientLogoS3Key` on `Workspace`
- Preview thumbnail shown after upload with remove option
- If no logo is uploaded, PDF exports with LYRA branding only — no error or prompt

---

## Generation Logic

### API routes
- `POST /api/assistant/generate` — creates `AssistantReport` record (GENERATING), runs generation, saves result (READY or FAILED)
- `GET /api/assistant/reports` — list all reports for workspace
- `GET /api/assistant/[reportId]/export-pdf` — returns cached PDF or generates and caches to S3

Both routes return 403 for STARTER plan.

### Pre-calculation (in code, before Claude)
These values are computed in code and passed as clean numbers to the prompt — Claude does not do maths:
- Total posts published in period
- Per-platform: post count, average engagement rate, top post (by engagement)
- Content theme distribution (from brand profile themes matched against post captions heuristically)

### Claude's role
Single prompt, returns structured JSON:
1. `insightNarrative` — 3–4 sentence review: what performed well, which platform led, what to adjust
2. `strategy.months` — three month objects with content pillars, key dates (from region + industry context), campaign ideas, recommended frequency

Model: `claude-sonnet-4-6`
Timeout: 45 seconds
On failure: mark report FAILED, surface retry button — do not save partial results

### Auto-quarterly cron
Route: `POST /api/cron/quarterly-report`
Schedule: 1 Jan, 1 Apr, 1 Jul, 1 Oct (covers previous 90 days)
Targets: all workspaces on Pro/Agency with ≥ 5 published posts in the period
Below threshold: skip silently, log notice — no sparse reports generated

### PDF generation
Library: `@react-pdf/renderer`
Generated server-side on first export request
Cached to S3 at `pdfS3Key`
Cleared when report is regenerated (next export rebuilds it)

**PDF structure:**
1. Cover page: client logo (if set) + LYRA mark, workspace name, quarter label, generated date
2. Quarterly Review section
3. Next 3 Months Strategy section

Fonts embedded: DM Sans (Regular, Medium) + Geist Mono (Regular)
Colours: LYRA design tokens (background `#080808`, text-primary `#e2e2e2`, accent-platinum `#d8d8d8`)

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Fewer than 5 posts in period | "Not enough data" state — explains minimum, links to calendar. Cron skips. |
| No brand profile built | Report generates without voice/tone context. Note in report: "Build your brand profile for richer recommendations." |
| Less than 90 days of workspace history | Generates from available data. Report header notes the partial period. |
| No client logo uploaded | PDF exports with LYRA branding only |
| PDF generation failure | Inline error with "Retry export". Does not require regenerating the report. |
| Claude timeout (>45s) | Report marked FAILED. Existing READY report (if any) preserved. |

---

## Testing

- **Unit:** Metric pre-calculation functions — engagement rate, top post selection logic
- **Integration:** `POST /api/assistant/generate` with mocked Claude response — verifies correct JSON shape saved to DB
- **Integration:** Plan gate — STARTER workspace returns 403 from API routes
- **Manual:** Generate a real report in dev, export PDF, verify co-branding renders correctly with and without client logo

---

## Implementation Notes

- Do not implement before the showcase
- This is a standalone feature — no changes required to existing pages except: sidebar nav item, workspace settings (new Branding tab), and the Prisma schema migration
- The upsell page design should follow the same locked-gate pattern used on the Brand AI page for workspaces that haven't completed setup
