# LYRA Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LYRA Assistant — a plan-gated quarterly review + 3-month strategy report with co-branded PDF export, sidebar nav entry, and workspace branding settings.

**Architecture:** Server component page gates on plan (STARTER → upsell, Pro/Agency → report view); generation is a POST API route that pre-calculates metrics in TypeScript then calls Claude for narrative and strategy JSON; PDFs are generated server-side via `@react-pdf/renderer`, cached to S3, and returned as presigned download URLs.

**Tech Stack:** Next.js 15 App Router, Prisma, `@react-pdf/renderer` v4, AWS S3 (`putObject` helper), Anthropic `claude-sonnet-4-6`, Tailwind design tokens, Lucide React, shadcn/ui.

---

## File Map

**New files — services:**
- `services/assistant/report-types.ts` — shared TypeScript interfaces for ReportData JSON shape
- `services/assistant/report-generator.ts` — metric pre-calculation, Claude call, quarter utilities
- `services/assistant/pdf-generator.ts` — `@react-pdf/renderer` document, font registration, `generatePDF()`

**New files — API routes:**
- `app/api/assistant/generate/route.ts` — POST: create/regenerate report for workspace
- `app/api/assistant/reports/route.ts` — GET: list reports for workspace
- `app/api/assistant/[reportId]/export-pdf/route.ts` — GET: return cached or newly-generated PDF URL
- `app/api/cron/quarterly-report/route.ts` — GET (cron): auto-generate for all Pro/Agency workspaces
- `app/api/workspaces/[id]/logo/route.ts` — POST/DELETE: upload/remove client logo

**New files — UI:**
- `app/(dashboard)/workspace/[workspaceId]/assistant/page.tsx` — server component, plan gate
- `components/lyra/assistant/assistant-upsell.tsx` — STARTER upsell page
- `components/lyra/assistant/assistant-report-view.tsx` — 'use client' report viewer + generator
- `components/lyra/settings/branding-tab.tsx` — 'use client' logo upload component

**Modified files:**
- `prisma/schema.prisma` — add `AssistantReport` model, `AssistantReportStatus` enum, 3 fields on `Workspace`
- `next.config.ts` — add `serverExternalPackages: ['@react-pdf/renderer']`
- `lib/s3.ts` — add `putObject()` helper for server-side direct upload
- `components/lyra/app-shell/sidebar.tsx` — add LYRA Assistant nav item (Sparkles icon)
- `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — add Branding tab section

**New test file:**
- `__tests__/services/assistant/report-generator.test.ts` — unit tests for pure calculation functions

---

### Task 1: Schema migration + next.config

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `next.config.ts`

- [ ] **Step 1: Update Prisma schema**

Open `prisma/schema.prisma`. Add three fields to the `Workspace` model (after the `competitors` relation line):

```prisma
  assistantReports  AssistantReport[]
  clientLogoS3Key   String?
  region            String            @default("AU")
```

Then add the new enum and model at the bottom of the file (after the `CompetitorSnapshot` model):

```prisma
enum AssistantReportStatus {
  GENERATING
  READY
  FAILED
}

model AssistantReport {
  id          String                @id @default(cuid())
  workspaceId String
  workspace   Workspace             @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  quarter     String
  generatedAt DateTime              @default(now())
  status      AssistantReportStatus
  reportData  Json?
  pdfS3Key    String?
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  @@index([workspaceId, createdAt])
}
```

- [ ] **Step 2: Push schema to DB**

```bash
cd lyra
npx prisma generate && npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Update next.config.ts**

Read `next.config.ts` first. If it has an existing `NextConfig` object, add `serverExternalPackages` to it. The result should be:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
}

export default nextConfig
```

If the file already has other config keys (e.g. `images`, `experimental`), preserve them — only add the `serverExternalPackages` key.

- [ ] **Step 4: Verify types generated**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client" with no errors. Confirm `AssistantReport` and `AssistantReportStatus` appear in the output.

- [ ] **Step 5: Commit**

```bash
git add lyra/prisma/schema.prisma lyra/next.config.ts
git commit -m "feat: add AssistantReport schema + serverExternalPackages for react-pdf"
```

---

### Task 2: TypeScript types + S3 putObject helper

**Files:**
- Create: `lyra/services/assistant/report-types.ts`
- Modify: `lyra/lib/s3.ts`

- [ ] **Step 1: Create report-types.ts**

```typescript
export interface PerformancePeriod {
  from: string
  to: string
  label: string
}

export interface PlatformPerformance {
  platform: string
  postCount: number
  avgEngagementRate: number
  topPostId: string | null
}

export interface StrategyKeyDate {
  date: string
  name: string
  campaignIdea: string
}

export interface StrategyFrequency {
  platform: string
  postsPerWeek: number
}

export interface StrategyMonth {
  month: string
  contentPillars: string[]
  keyDates: StrategyKeyDate[]
  recommendedFrequency: StrategyFrequency[]
}

export interface ReportPerformance {
  totalPosts: number
  avgEngagementRate: number
  bestPlatform: string | null
  topContentTheme: string | null
  byPlatform: PlatformPerformance[]
  insightNarrative: string
}

export interface ReportData {
  period: PerformancePeriod
  performance: ReportPerformance
  strategy: {
    months: StrategyMonth[]
  }
}

export interface ReportMetrics {
  totalPosts: number
  avgEngagementRate: number
  bestPlatform: string | null
  topContentTheme: string | null
  byPlatform: PlatformPerformance[]
}
```

- [ ] **Step 2: Add putObject to lib/s3.ts**

Read `lib/s3.ts` first. Add the import `PutObjectCommand` is already imported — verify. Then add this function after `getDownloadPresignedUrl`:

```typescript
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
}
```

Note: `PutObjectCommand` is already imported at the top of the file. If `Body` causes a TypeScript error, import `Buffer` is a Node.js global so no import needed.

- [ ] **Step 3: Verify types check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors. If type errors, fix them before committing.

- [ ] **Step 4: Commit**

```bash
git add lyra/services/assistant/report-types.ts lyra/lib/s3.ts
git commit -m "feat: add AssistantReport TypeScript types and S3 putObject helper"
```

---

### Task 3: Report generator service + tests

**Files:**
- Create: `lyra/services/assistant/report-generator.ts`
- Create: `lyra/__tests__/services/assistant/report-generator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/assistant/report-generator.test.ts`:

```typescript
import {
  getQuarterLabel,
  getPeriodBounds,
  calculateEngagementRate,
} from '@/services/assistant/report-generator'

describe('getQuarterLabel', () => {
  it('returns Q1 for January', () => {
    expect(getQuarterLabel(new Date('2026-01-15'))).toBe('Q1-2026')
  })

  it('returns Q2 for April', () => {
    expect(getQuarterLabel(new Date('2026-04-01'))).toBe('Q2-2026')
  })

  it('returns Q3 for July', () => {
    expect(getQuarterLabel(new Date('2026-07-01'))).toBe('Q3-2026')
  })

  it('returns Q4 for October', () => {
    expect(getQuarterLabel(new Date('2026-10-31'))).toBe('Q4-2026')
  })
})

describe('getPeriodBounds', () => {
  it('covers exactly 90 days', () => {
    const { from, to } = getPeriodBounds(90)
    const diffMs = new Date(to).getTime() - new Date(from).getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(90)
  })

  it('to date is today', () => {
    const { to } = getPeriodBounds(90)
    const today = new Date().toISOString().split('T')[0]
    expect(to).toBe(today)
  })
})

describe('calculateEngagementRate', () => {
  it('calculates correctly with impressions', () => {
    const rate = calculateEngagementRate({ likes: 10, comments: 5, shares: 3, saves: 2, impressions: 200 })
    expect(rate).toBeCloseTo(0.1) // (10+5+3+2)/200 = 20/200 = 0.1
  })

  it('returns 0 when impressions are zero', () => {
    const rate = calculateEngagementRate({ likes: 10, comments: 5, shares: 3, saves: 2, impressions: 0 })
    expect(rate).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd lyra && npx jest __tests__/services/assistant/report-generator.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '@/services/assistant/report-generator'"

- [ ] **Step 3: Create the service**

Create `services/assistant/report-generator.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { anthropic } from '@/lib/anthropic'
import type { ReportData, ReportMetrics, PlatformPerformance } from './report-types'

export function getQuarterLabel(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1
  return `Q${quarter}-${date.getFullYear()}`
}

export function getPeriodBounds(daysBack: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - daysBack)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export function calculateEngagementRate(metrics: {
  likes: number
  comments: number
  shares: number
  saves: number
  impressions: number
}): number {
  if (metrics.impressions === 0) return 0
  return (metrics.likes + metrics.comments + metrics.shares + metrics.saves) / metrics.impressions
}

export async function countQualifyingPosts(
  workspaceId: string,
  from: string,
  to: string
): Promise<number> {
  return prisma.post.count({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      publishedAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
  })
}

export async function calculateMetrics(
  workspaceId: string,
  from: string,
  to: string
): Promise<ReportMetrics> {
  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      publishedAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
    },
    include: {
      metrics: true,
      socialAccount: { select: { platform: true } },
    },
  })

  if (posts.length === 0) {
    return { totalPosts: 0, avgEngagementRate: 0, bestPlatform: null, topContentTheme: null, byPlatform: [] }
  }

  // Group by platform
  const byPlatformMap = new Map<string, { postCount: number; totalEngagement: number; topPostId: string | null; topEngagement: number }>()

  let globalTotalEngagement = 0
  let globalTotalWithImpressions = 0

  for (const post of posts) {
    const platform = post.socialAccount.platform
    if (!byPlatformMap.has(platform)) {
      byPlatformMap.set(platform, { postCount: 0, totalEngagement: 0, topPostId: null, topEngagement: -1 })
    }
    const entry = byPlatformMap.get(platform)!
    entry.postCount++

    if (post.metrics) {
      const rate = calculateEngagementRate({
        likes: post.metrics.likes,
        comments: post.metrics.comments,
        shares: post.metrics.shares,
        saves: post.metrics.saves,
        impressions: post.metrics.impressions,
      })
      entry.totalEngagement += rate
      if (post.metrics.impressions > 0) globalTotalWithImpressions++
      globalTotalEngagement += rate

      if (rate > entry.topEngagement) {
        entry.topEngagement = rate
        entry.topPostId = post.id
      }
    }
  }

  const byPlatform: PlatformPerformance[] = []
  let bestPlatform: string | null = null
  let bestAvgRate = -1

  for (const [platform, data] of byPlatformMap) {
    const avgEngagementRate = data.postCount > 0 ? data.totalEngagement / data.postCount : 0
    byPlatform.push({ platform, postCount: data.postCount, avgEngagementRate, topPostId: data.topPostId })
    if (avgEngagementRate > bestAvgRate) {
      bestAvgRate = avgEngagementRate
      bestPlatform = platform
    }
  }

  const avgEngagementRate = posts.length > 0 ? globalTotalEngagement / posts.length : 0

  // Top content theme from Post.topic field
  const topicCounts = new Map<string, number>()
  for (const post of posts) {
    if (post.topic) {
      topicCounts.set(post.topic, (topicCounts.get(post.topic) ?? 0) + 1)
    }
  }
  let topContentTheme: string | null = null
  let maxCount = 0
  for (const [topic, count] of topicCounts) {
    if (count > maxCount) { maxCount = count; topContentTheme = topic }
  }

  return { totalPosts: posts.length, avgEngagementRate, bestPlatform, topContentTheme, byPlatform }
}

export async function generateReportData(
  metrics: ReportMetrics,
  period: { from: string; to: string; label: string },
  region: string,
  brandProfile: { contentThemes?: string[]; voiceSummary?: string | null } | null
): Promise<ReportData> {
  const forwardMonths: string[] = []
  const periodEnd = new Date(period.to)
  for (let i = 1; i <= 3; i++) {
    const d = new Date(periodEnd)
    d.setMonth(d.getMonth() + i)
    forwardMonths.push(d.toLocaleString('en-AU', { month: 'long', year: 'numeric' }))
  }

  const platformSummary = metrics.byPlatform
    .map(p => `${p.platform}: ${p.postCount} posts, avg engagement ${(p.avgEngagementRate * 100).toFixed(1)}%`)
    .join('\n')

  const prompt = `You are a social media strategist generating a quarterly report for a ${region} business.

PERFORMANCE DATA (${period.label}):
- Total posts published: ${metrics.totalPosts}
- Overall average engagement rate: ${(metrics.avgEngagementRate * 100).toFixed(1)}%
- Best performing platform: ${metrics.bestPlatform ?? 'unknown'}
- Top content theme: ${metrics.topContentTheme ?? 'not determined'}
- By platform:
${platformSummary}

${brandProfile?.voiceSummary ? `BRAND VOICE: ${brandProfile.voiceSummary}` : ''}
${brandProfile?.contentThemes?.length ? `CONTENT THEMES: ${brandProfile.contentThemes.join(', ')}` : ''}

Generate a JSON response with exactly this structure (no markdown, no explanation — ONLY valid JSON):
{
  "insightNarrative": "3-4 sentences reviewing the quarter: what performed well, which platform led, one specific observation, one recommendation for improvement",
  "strategy": {
    "months": [
      {
        "month": "${forwardMonths[0]}",
        "contentPillars": ["3-4 content pillar names relevant to the brand"],
        "keyDates": [
          {
            "date": "YYYY-MM-DD",
            "name": "Key date or event name (${region} context)",
            "campaignIdea": "One sentence campaign idea"
          }
        ],
        "recommendedFrequency": [
          { "platform": "INSTAGRAM", "postsPerWeek": 4 }
        ]
      },
      {
        "month": "${forwardMonths[1]}",
        "contentPillars": [],
        "keyDates": [],
        "recommendedFrequency": []
      },
      {
        "month": "${forwardMonths[2]}",
        "contentPillars": [],
        "keyDates": [],
        "recommendedFrequency": []
      }
    ]
  }
}

Only include platforms in recommendedFrequency that appeared in the performance data. Key dates must be real dates for ${region}. Return ONLY the JSON object.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  // Strip any markdown code fences if Claude added them
  const jsonText = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  const aiData = JSON.parse(jsonText) as { insightNarrative: string; strategy: { months: unknown[] } }

  return {
    period,
    performance: {
      totalPosts: metrics.totalPosts,
      avgEngagementRate: metrics.avgEngagementRate,
      bestPlatform: metrics.bestPlatform,
      topContentTheme: metrics.topContentTheme,
      byPlatform: metrics.byPlatform,
      insightNarrative: aiData.insightNarrative,
    },
    strategy: aiData.strategy as ReportData['strategy'],
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd lyra && npx jest __tests__/services/assistant/report-generator.test.ts --no-coverage
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lyra/services/assistant/report-types.ts lyra/services/assistant/report-generator.ts lyra/__tests__/services/assistant/report-generator.test.ts
git commit -m "feat: add report generator service with metric calculation and Claude integration"
```

---

### Task 4: PDF generator service

**Files:**
- Create: `lyra/services/assistant/pdf-generator.ts`

- [ ] **Step 1: Verify @react-pdf/renderer is installed**

```bash
cd lyra && npm list @react-pdf/renderer
```

Expected: shows a version (should be 4.x). If not installed:

```bash
npm install @react-pdf/renderer
```

- [ ] **Step 2: Create pdf-generator.ts**

Create `services/assistant/pdf-generator.ts`:

```typescript
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font, Image, pdf } from '@react-pdf/renderer'
import type { ReportData } from './report-types'

Font.register({
  family: 'DM Sans',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff',
      fontWeight: 400,
    },
    {
      src: 'https://cdn.jsdelivr.net/npm/@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff',
      fontWeight: 500,
    },
  ],
})

Font.register({
  family: 'Geist Mono',
  src: 'https://cdn.jsdelivr.net/npm/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff',
})

const C = {
  bg: '#080808',
  bgSecondary: '#0f0f0f',
  bgBorder: '#222222',
  textPrimary: '#e2e2e2',
  textSecondary: '#888888',
  textTertiary: '#555555',
  platinum: '#d8d8d8',
  silver: '#aaaaaa',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    padding: 48,
    fontFamily: 'DM Sans',
    color: C.textPrimary,
  },
  coverPage: {
    backgroundColor: C.bg,
    padding: 48,
    fontFamily: 'DM Sans',
    color: C.textPrimary,
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  clientLogo: {
    maxHeight: 40,
    maxWidth: 120,
    objectFit: 'contain',
  },
  lyraMark: {
    fontSize: 18,
    fontFamily: 'DM Sans',
    fontWeight: 400,
    color: C.silver,
    letterSpacing: 4,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.bgBorder,
    marginVertical: 24,
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: 'DM Sans',
    fontWeight: 400,
    color: C.textPrimary,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: C.textSecondary,
    marginBottom: 4,
  },
  coverDate: {
    fontSize: 12,
    color: C.textTertiary,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: 500,
    color: C.textPrimary,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.bgBorder,
    borderRadius: 10,
    padding: 12,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: 500,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Geist Mono',
    color: C.platinum,
  },
  narrative: {
    fontSize: 13,
    lineHeight: 1.6,
    color: C.textSecondary,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.bgBorder,
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: 500,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.bgBorder,
  },
  tableCell: {
    fontSize: 12,
    color: C.textSecondary,
    flex: 1,
  },
  tableCellMono: {
    fontSize: 12,
    fontFamily: 'Geist Mono',
    color: C.textPrimary,
    flex: 1,
  },
  monthCard: {
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.bgBorder,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: C.textPrimary,
    marginBottom: 10,
  },
  pillarsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  pillarTag: {
    backgroundColor: C.bgBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    color: C.textSecondary,
  },
  keyDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  keyDateName: {
    fontSize: 11,
    fontWeight: 500,
    color: C.textPrimary,
    width: 120,
  },
  keyDateIdea: {
    fontSize: 11,
    color: C.textSecondary,
    flex: 1,
  },
  subHeading: {
    fontSize: 10,
    fontWeight: 500,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 8,
  },
})

interface CoverPageProps {
  workspaceName: string
  quarter: string
  clientLogoUrl: string | null
  generatedDate: string
}

function CoverPage({ workspaceName, quarter, clientLogoUrl, generatedDate }: CoverPageProps) {
  return React.createElement(
    Page,
    { size: 'A4', style: styles.coverPage },
    React.createElement(
      View,
      null,
      React.createElement(
        View,
        { style: styles.logoRow },
        clientLogoUrl
          ? React.createElement(Image, { src: clientLogoUrl, style: styles.clientLogo })
          : null,
        React.createElement(Text, { style: styles.lyraMark }, 'LYRA')
      ),
      React.createElement(View, { style: styles.divider }),
      React.createElement(Text, { style: styles.coverTitle }, 'LYRA Assistant'),
      React.createElement(Text, { style: styles.coverSubtitle }, workspaceName),
      React.createElement(Text, { style: styles.coverSubtitle }, quarter + ' Report'),
    ),
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: styles.coverDate }, 'Generated ' + generatedDate)
    )
  )
}

interface PerformancePageProps {
  report: ReportData
}

function PerformancePage({ report }: PerformancePageProps) {
  const { performance, period } = report
  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.sectionHeading }, 'Quarterly Review'),
    React.createElement(Text, { style: { ...styles.coverDate, marginBottom: 16 } }, period.label),
    React.createElement(
      View,
      { style: styles.statRow },
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Total Posts'),
        React.createElement(Text, { style: styles.statValue }, String(performance.totalPosts))
      ),
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Avg Engagement'),
        React.createElement(Text, { style: styles.statValue }, (performance.avgEngagementRate * 100).toFixed(1) + '%')
      ),
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Best Platform'),
        React.createElement(Text, { style: styles.statValue }, performance.bestPlatform ?? '—')
      ),
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Top Theme'),
        React.createElement(Text, { style: { ...styles.statValue, fontSize: 12 } }, performance.topContentTheme ?? '—')
      )
    ),
    React.createElement(Text, { style: styles.narrative }, performance.insightNarrative),
    React.createElement(
      View,
      { style: styles.tableHeader },
      React.createElement(Text, { style: styles.tableHeaderCell }, 'Platform'),
      React.createElement(Text, { style: styles.tableHeaderCell }, 'Posts'),
      React.createElement(Text, { style: styles.tableHeaderCell }, 'Avg Engagement')
    ),
    ...performance.byPlatform.map(p =>
      React.createElement(
        View,
        { key: p.platform, style: styles.tableRow },
        React.createElement(Text, { style: styles.tableCell }, p.platform),
        React.createElement(Text, { style: styles.tableCellMono }, String(p.postCount)),
        React.createElement(Text, { style: styles.tableCellMono }, (p.avgEngagementRate * 100).toFixed(1) + '%')
      )
    )
  )
}

interface StrategyPageProps {
  report: ReportData
}

function StrategyPage({ report }: StrategyPageProps) {
  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.sectionHeading }, 'Next 3 Months Strategy'),
    ...report.strategy.months.map((month, i) =>
      React.createElement(
        View,
        { key: i, style: styles.monthCard },
        React.createElement(Text, { style: styles.monthLabel }, month.month),
        month.contentPillars.length > 0
          ? React.createElement(
              View,
              null,
              React.createElement(Text, { style: styles.subHeading }, 'Content Pillars'),
              React.createElement(
                View,
                { style: styles.pillarsRow },
                ...month.contentPillars.map((p, j) =>
                  React.createElement(Text, { key: j, style: styles.pillarTag }, p)
                )
              )
            )
          : null,
        month.keyDates.length > 0
          ? React.createElement(
              View,
              null,
              React.createElement(Text, { style: styles.subHeading }, 'Key Dates'),
              ...month.keyDates.map((d, j) =>
                React.createElement(
                  View,
                  { key: j, style: styles.keyDateRow },
                  React.createElement(Text, { style: styles.keyDateName }, d.name),
                  React.createElement(Text, { style: styles.keyDateIdea }, d.campaignIdea)
                )
              )
            )
          : null,
        month.recommendedFrequency.length > 0
          ? React.createElement(
              View,
              null,
              React.createElement(Text, { style: styles.subHeading }, 'Post Frequency'),
              ...month.recommendedFrequency.map((f, j) =>
                React.createElement(
                  View,
                  { key: j, style: styles.tableRow },
                  React.createElement(Text, { style: styles.tableCell }, f.platform),
                  React.createElement(Text, { style: styles.tableCellMono }, f.postsPerWeek + 'x/week')
                )
              )
            )
          : null
      )
    )
  )
}

export async function generatePDF(
  report: ReportData,
  workspaceName: string,
  quarter: string,
  clientLogoUrl: string | null
): Promise<Buffer> {
  const generatedDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  const doc = React.createElement(
    Document,
    null,
    React.createElement(CoverPage, { workspaceName, quarter, clientLogoUrl, generatedDate }),
    React.createElement(PerformancePage, { report }),
    React.createElement(StrategyPage, { report })
  )

  const blob = await pdf(doc).toBlob()
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
```

- [ ] **Step 3: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors. If `React.createElement` types fail, add `import type { } from 'react'` — React should already be in deps from Next.js.

- [ ] **Step 4: Commit**

```bash
git add lyra/services/assistant/pdf-generator.ts
git commit -m "feat: add PDF generator service using @react-pdf/renderer with LYRA design system"
```

---

### Task 5: Generate API route

**Files:**
- Create: `lyra/app/api/assistant/generate/route.ts`

- [ ] **Step 1: Create the generate route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getQuarterLabel, getPeriodBounds, countQualifyingPosts, calculateMetrics, generateReportData } from '@/services/assistant/report-generator'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        access: { some: { userId: user.id } },
      },
      select: {
        id: true,
        name: true,
        plan: true,
        region: true,
        brandProfile: {
          select: { contentThemes: true, voiceSummary: true },
        },
      },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
    }

    const { from, to } = getPeriodBounds(90)
    const quarter = getQuarterLabel(new Date())

    const qualifying = await countQualifyingPosts(workspaceId, from, to)
    if (qualifying < 5) {
      return NextResponse.json(
        { error: 'Not enough data', detail: `${qualifying} published posts found. Minimum 5 required.` },
        { status: 422 }
      )
    }

    // Clear cached PDF for this quarter if regenerating
    await prisma.assistantReport.updateMany({
      where: { workspaceId, quarter, status: 'READY' },
      data: { pdfS3Key: null },
    })

    const report = await prisma.assistantReport.create({
      data: {
        workspaceId,
        quarter,
        status: 'GENERATING',
      },
    })

    try {
      const metrics = await calculateMetrics(workspaceId, from, to)
      const periodLabel = (() => {
        const f = new Date(from)
        const t = new Date(to)
        const fmt = (d: Date) => d.toLocaleString('en-AU', { month: 'short', year: 'numeric' })
        return `${fmt(f)}–${fmt(t)}`
      })()

      const reportData = await generateReportData(
        metrics,
        { from, to, label: periodLabel },
        workspace.region,
        workspace.brandProfile
      )

      const updated = await prisma.assistantReport.update({
        where: { id: report.id },
        data: { status: 'READY', reportData: reportData as object, generatedAt: new Date() },
      })

      return NextResponse.json({ report: updated })
    } catch (genError) {
      await prisma.assistantReport.update({
        where: { id: report.id },
        data: { status: 'FAILED' },
      })
      console.error('Report generation failed:', genError)
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lyra/app/api/assistant/generate/route.ts
git commit -m "feat: add POST /api/assistant/generate route with plan gating and metric pre-calculation"
```

---

### Task 6: List reports route + cron route

**Files:**
- Create: `lyra/app/api/assistant/reports/route.ts`
- Create: `lyra/app/api/cron/quarterly-report/route.ts`

- [ ] **Step 1: Create the reports list route**

```typescript
// app/api/assistant/reports/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const workspaceId = req.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        access: { some: { userId: user.id } },
      },
      select: { plan: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
    }

    const reports = await prisma.assistantReport.findMany({
      where: { workspaceId },
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true,
        quarter: true,
        status: true,
        generatedAt: true,
        reportData: true,
        pdfS3Key: true,
      },
    })

    return NextResponse.json({ reports })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create the quarterly cron route**

```typescript
// app/api/cron/quarterly-report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getQuarterLabel, getPeriodBounds, countQualifyingPosts, calculateMetrics, generateReportData } from '@/services/assistant/report-generator'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // Get previous month to determine the quarter that just ended
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const quarter = getQuarterLabel(prevMonth)
  const { from, to } = getPeriodBounds(90)

  const workspaces = await prisma.workspace.findMany({
    where: {
      plan: { in: ['PRO', 'AGENCY'] },
    },
    select: {
      id: true,
      name: true,
      region: true,
      brandProfile: { select: { contentThemes: true, voiceSummary: true } },
    },
  })

  const results = { generated: 0, skipped: 0, failed: 0 }

  for (const workspace of workspaces) {
    try {
      const qualifying = await countQualifyingPosts(workspace.id, from, to)
      if (qualifying < 5) {
        console.log(`Cron: skipping workspace ${workspace.id} — only ${qualifying} qualifying posts`)
        results.skipped++
        continue
      }

      const existing = await prisma.assistantReport.findFirst({
        where: { workspaceId: workspace.id, quarter },
      })
      if (existing) {
        results.skipped++
        continue
      }

      const report = await prisma.assistantReport.create({
        data: { workspaceId: workspace.id, quarter, status: 'GENERATING' },
      })

      try {
        const metrics = await calculateMetrics(workspace.id, from, to)
        const f = new Date(from)
        const t = new Date(to)
        const fmt = (d: Date) => d.toLocaleString('en-AU', { month: 'short', year: 'numeric' })
        const periodLabel = `${fmt(f)}–${fmt(t)}`

        const reportData = await generateReportData(
          metrics,
          { from, to, label: periodLabel },
          workspace.region,
          workspace.brandProfile
        )

        await prisma.assistantReport.update({
          where: { id: report.id },
          data: { status: 'READY', reportData: reportData as object, generatedAt: new Date() },
        })
        results.generated++
      } catch {
        await prisma.assistantReport.update({
          where: { id: report.id },
          data: { status: 'FAILED' },
        })
        results.failed++
      }
    } catch (err) {
      console.error(`Cron: error processing workspace ${workspace.id}:`, err)
      results.failed++
    }
  }

  return NextResponse.json({ quarter, ...results })
}
```

- [ ] **Step 3: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lyra/app/api/assistant/reports/route.ts lyra/app/api/cron/quarterly-report/route.ts
git commit -m "feat: add assistant reports list route and auto-quarterly cron route"
```

---

### Task 7: Export PDF route + logo upload route

**Files:**
- Create: `lyra/app/api/assistant/[reportId]/export-pdf/route.ts`
- Create: `lyra/app/api/workspaces/[id]/logo/route.ts`

- [ ] **Step 1: Create the export-pdf route**

```typescript
// app/api/assistant/[reportId]/export-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDownloadPresignedUrl, putObject } from '@/lib/s3'
import { generatePDF } from '@/services/assistant/pdf-generator'
import type { ReportData } from '@/services/assistant/report-types'

export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const user = await requireAuth()
    const { reportId } = await params

    const report = await prisma.assistantReport.findFirst({
      where: {
        id: reportId,
        workspace: { access: { some: { userId: user.id } } },
      },
      include: {
        workspace: {
          select: { id: true, name: true, plan: true, clientLogoS3Key: true },
        },
      },
    })

    if (!report) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (report.workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
    }

    if (report.status !== 'READY' || !report.reportData) {
      return NextResponse.json({ error: 'Report not ready' }, { status: 422 })
    }

    // Return cached PDF if available
    if (report.pdfS3Key) {
      const url = await getDownloadPresignedUrl(report.pdfS3Key)
      return NextResponse.json({ url })
    }

    // Generate and cache
    let clientLogoUrl: string | null = null
    if (report.workspace.clientLogoS3Key) {
      clientLogoUrl = await getDownloadPresignedUrl(report.workspace.clientLogoS3Key)
    }

    const pdfBuffer = await generatePDF(
      report.reportData as unknown as ReportData,
      report.workspace.name,
      report.quarter,
      clientLogoUrl
    )

    const s3Key = `assistant-reports/${report.workspace.id}/${report.id}.pdf`
    await putObject(s3Key, pdfBuffer, 'application/pdf')

    await prisma.assistantReport.update({
      where: { id: report.id },
      data: { pdfS3Key: s3Key },
    })

    const url = await getDownloadPresignedUrl(s3Key)
    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PDF export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create the logo upload route**

```typescript
// app/api/workspaces/[id]/logo/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { putObject, deleteObject } from '@/lib/s3'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, clientLogoS3Key: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('logo') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File must be PNG, JPG, or SVG' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 })
    }

    const ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : 'jpg'
    const s3Key = `workspace-logos/${workspaceId}/logo.${ext}`

    // Delete old logo if different key
    if (workspace.clientLogoS3Key && workspace.clientLogoS3Key !== s3Key) {
      await deleteObject(workspace.clientLogoS3Key).catch(() => {})
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    await putObject(s3Key, buffer, file.type)

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { clientLogoS3Key: s3Key },
    })

    return NextResponse.json({ success: true, key: s3Key })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Logo upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, clientLogoS3Key: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (workspace.clientLogoS3Key) {
      await deleteObject(workspace.clientLogoS3Key).catch(() => {})
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { clientLogoS3Key: null },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Logo delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lyra/app/api/assistant/[reportId]/export-pdf/route.ts lyra/app/api/workspaces/[id]/logo/route.ts
git commit -m "feat: add export-pdf route with S3 caching and logo upload/delete routes"
```

---

### Task 8: Sidebar nav item

**Files:**
- Modify: `lyra/components/lyra/app-shell/sidebar.tsx`

- [ ] **Step 1: Read the sidebar file**

Read `components/lyra/app-shell/sidebar.tsx` to understand the exact structure of the `navItems` array and how icons/hrefs are defined.

- [ ] **Step 2: Add Sparkles import**

Add `Sparkles` to the Lucide React imports in `sidebar.tsx`. It should already have other icons imported — add `Sparkles` to the same import.

- [ ] **Step 3: Add LYRA Assistant to navItems**

Find the nav item for SEO (it has `href` containing `'seo'` and a `BarChart2` or similar icon). Add the LYRA Assistant item immediately after it:

```typescript
{
  href: `/workspace/${workspaceId}/assistant`,
  label: 'LYRA Assistant',
  icon: Sparkles,
},
```

The exact insertion depends on how the array is structured. This item should appear between SEO and the workspace setup counter. The sidebar should route all plans to `/assistant` — the page itself handles the plan gate.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lyra/components/lyra/app-shell/sidebar.tsx
git commit -m "feat: add LYRA Assistant nav item to sidebar with Sparkles icon"
```

---

### Task 9: Assistant page + upsell component

**Files:**
- Create: `lyra/app/(dashboard)/workspace/[workspaceId]/assistant/page.tsx`
- Create: `lyra/components/lyra/assistant/assistant-upsell.tsx`

- [ ] **Step 1: Create the upsell component**

```typescript
// components/lyra/assistant/assistant-upsell.tsx
'use client'

import { Lock, TrendingUp, FileText, Download } from 'lucide-react'
import Link from 'next/link'

export function AssistantUpsell() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-background-secondary border border-background-border mb-6">
          <Lock size={24} strokeWidth={1.5} className="text-text-tertiary" />
        </div>
        <h1 className="font-sans text-2xl font-medium text-text-primary mb-3">
          LYRA Assistant
        </h1>
        <p className="font-sans text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
          LYRA Assistant generates a quarterly performance review and 3-month content strategy for your workspace — co-branded with your client logo and exportable as a PDF.
        </p>
      </div>

      <div className="bg-background-secondary border border-background-border rounded-xl p-5 mb-8 space-y-3">
        <div className="flex items-start gap-3">
          <TrendingUp size={16} strokeWidth={1.5} className="text-text-secondary mt-0.5 shrink-0" />
          <div>
            <p className="font-sans text-sm font-medium text-text-primary">Quarterly performance review</p>
            <p className="font-sans text-xs text-text-secondary">Engagement metrics, top content, platform breakdown, and AI narrative</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <FileText size={16} strokeWidth={1.5} className="text-text-secondary mt-0.5 shrink-0" />
          <div>
            <p className="font-sans text-sm font-medium text-text-primary">3-month content strategy</p>
            <p className="font-sans text-xs text-text-secondary">Monthly content pillars, key dates, campaign ideas, and posting frequency</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Download size={16} strokeWidth={1.5} className="text-text-secondary mt-0.5 shrink-0" />
          <div>
            <p className="font-sans text-sm font-medium text-text-primary">Co-branded PDF export</p>
            <p className="font-sans text-xs text-text-secondary">Client logo alongside the LYRA mark — ready to share</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-background-secondary border border-background-border rounded-xl p-5">
          <p className="font-sans text-xs font-medium text-text-tertiary uppercase tracking-widest mb-1">Pro</p>
          <p className="font-sans text-sm font-medium text-text-primary mb-3">For freelancers</p>
          <ul className="space-y-1.5">
            {['Up to 5 workspaces', 'LYRA Assistant reports', 'AI caption generation', 'AI response drafts'].map(f => (
              <li key={f} className="font-sans text-xs text-text-secondary flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-text-tertiary shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-background-secondary border border-background-border rounded-xl p-5">
          <p className="font-sans text-xs font-medium text-text-tertiary uppercase tracking-widest mb-1">Agency</p>
          <p className="font-sans text-sm font-medium text-text-primary mb-3">For agencies</p>
          <ul className="space-y-1.5">
            {['Unlimited workspaces', 'LYRA Assistant reports', 'Full AI autonomy', 'Team members + guardrails'].map(f => (
              <li key={f} className="font-sans text-xs text-text-secondary flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-text-tertiary shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="text-center space-y-3">
        <Link
          href="/account/billing"
          className="inline-flex items-center justify-center px-6 py-2.5 bg-accent-platinum text-background-primary rounded-lg font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
        >
          Upgrade to Pro
        </Link>
        <div>
          <Link href="/account/billing" className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150">
            Compare plans
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the assistant page (server component)**

```typescript
// app/(dashboard)/workspace/[workspaceId]/assistant/page.tsx
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { AssistantUpsell } from '@/components/lyra/assistant/assistant-upsell'
import { AssistantReportView } from '@/components/lyra/assistant/assistant-report-view'

interface PageProps {
  params: Promise<{ workspaceId: string }>
}

export default async function AssistantPage({ params }: PageProps) {
  const { workspaceId } = await params
  const user = await requireAuth().catch(() => null)
  if (!user) redirect('/auth/login')

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      access: { some: { userId: user.id } },
    },
    select: {
      id: true,
      name: true,
      plan: true,
      assistantReports: {
        orderBy: { generatedAt: 'desc' },
        select: {
          id: true,
          quarter: true,
          status: true,
          generatedAt: true,
          reportData: true,
          pdfS3Key: true,
        },
      },
    },
  })

  if (!workspace) redirect('/')

  if (workspace.plan === 'STARTER') {
    return <AssistantUpsell />
  }

  // Serialise dates for client component
  const serialisedReports = workspace.assistantReports.map(r => ({
    ...r,
    generatedAt: r.generatedAt.toISOString(),
  }))

  return (
    <AssistantReportView
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      initialReports={serialisedReports}
    />
  )
}
```

- [ ] **Step 3: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors. Note: `AssistantReportView` doesn't exist yet (Task 10) — the type check will fail until it does. This is expected. Proceed if the only error is the missing `AssistantReportView` import.

- [ ] **Step 4: Commit**

```bash
git add lyra/app/(dashboard)/workspace/[workspaceId]/assistant/page.tsx lyra/components/lyra/assistant/assistant-upsell.tsx
git commit -m "feat: add LYRA Assistant page with STARTER upsell component"
```

---

### Task 10: Report view client component

**Files:**
- Create: `lyra/components/lyra/assistant/assistant-report-view.tsx`

- [ ] **Step 1: Create the report view component**

```typescript
// components/lyra/assistant/assistant-report-view.tsx
'use client'

import { useState } from 'react'
import { Sparkles, Download, RefreshCw, ChevronDown } from 'lucide-react'
import type { ReportData } from '@/services/assistant/report-types'

interface SerializedReport {
  id: string
  quarter: string
  status: string
  generatedAt: string
  reportData: unknown
  pdfS3Key: string | null
}

interface AssistantReportViewProps {
  workspaceId: string
  workspaceName: string
  initialReports: SerializedReport[]
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background-secondary border border-background-border rounded-xl p-4 flex-1">
      <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-widest mb-2">{label}</p>
      <p className="font-mono text-xl text-accent-platinum">{value}</p>
    </div>
  )
}

function GeneratingSkeleton() {
  return (
    <div className="space-y-4 mt-6">
      <p className="font-sans text-sm text-text-secondary">
        LYRA is analysing your last quarter. This takes about 30 seconds.
      </p>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="h-20 rounded-xl bg-background-secondary border border-background-border animate-pulse"
        />
      ))}
    </div>
  )
}

export function AssistantReportView({ workspaceId, workspaceName, initialReports }: AssistantReportViewProps) {
  const [reports, setReports] = useState<SerializedReport[]>(initialReports)
  const [activeReportId, setActiveReportId] = useState<string | null>(
    initialReports.find(r => r.status === 'READY')?.id ?? null
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showQuarterDropdown, setShowQuarterDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeReport = reports.find(r => r.id === activeReportId)
  const reportData = activeReport?.reportData as ReportData | null

  const readyReports = reports.filter(r => r.status === 'READY')

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/assistant/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail ?? data.error ?? 'Generation failed.')
        return
      }
      const newReport: SerializedReport = {
        ...data.report,
        generatedAt: data.report.generatedAt,
      }
      setReports(prev => [newReport, ...prev.filter(r => r.quarter !== newReport.quarter)])
      setActiveReportId(newReport.id)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleExport() {
    if (!activeReportId) return
    setIsExporting(true)
    try {
      const res = await fetch(`/api/assistant/${activeReportId}/export-pdf`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Export failed.')
        return
      }
      window.open(data.url, '_blank')
    } catch {
      setError('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const currentQuarter = activeReport?.quarter

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} strokeWidth={1.5} className="text-text-secondary" />
            <h1 className="font-sans text-2xl font-medium text-text-primary">LYRA Assistant</h1>
          </div>
          <p className="font-sans text-sm text-text-secondary">{workspaceName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {readyReports.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowQuarterDropdown(!showQuarterDropdown)}
                className="flex items-center gap-1.5 px-3 py-2 bg-background-secondary border border-background-border rounded-lg font-sans text-sm text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150"
              >
                {currentQuarter}
                <ChevronDown size={14} strokeWidth={1.5} />
              </button>
              {showQuarterDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-background-tertiary border border-background-border rounded-xl overflow-hidden z-10 min-w-[120px]">
                  {readyReports.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setActiveReportId(r.id); setShowQuarterDropdown(false) }}
                      className={`w-full text-left px-4 py-2.5 font-sans text-sm transition-colors duration-150 ${
                        r.id === activeReportId
                          ? 'text-text-primary bg-background-hover'
                          : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
                      }`}
                    >
                      {r.quarter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeReport?.status === 'READY' && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 bg-background-secondary border border-background-border rounded-lg font-sans text-sm text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150 disabled:opacity-50"
            >
              {isExporting ? (
                <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" />
              ) : (
                <Download size={14} strokeWidth={1.5} />
              )}
              Export PDF
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent-platinum text-background-primary rounded-lg font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150 disabled:opacity-50"
          >
            {isGenerating ? (
              <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Sparkles size={14} strokeWidth={1.5} />
            )}
            {readyReports.some(r => r.quarter === activeReport?.quarter) ? 'Regenerate' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-background-secondary border border-status-error/30 rounded-xl p-4">
          <p className="font-sans text-sm text-status-error">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!isGenerating && reports.length === 0 && (
        <div className="text-center py-16">
          <Sparkles size={24} strokeWidth={1.5} className="mx-auto text-text-tertiary mb-4" />
          <p className="font-sans text-sm font-medium text-text-primary mb-2">No reports generated yet.</p>
          <p className="font-sans text-xs text-text-secondary max-w-sm mx-auto">
            Generate your first quarterly report to see performance insights and a 3-month content strategy.
          </p>
        </div>
      )}

      {/* Generating skeleton */}
      {isGenerating && <GeneratingSkeleton />}

      {/* Report content */}
      {!isGenerating && reportData && (
        <>
          {/* Quarterly Review */}
          <div>
            <h2 className="font-sans text-lg font-medium text-text-primary mb-4">Quarterly Review</h2>
            <p className="font-sans text-xs text-text-tertiary mb-4">{reportData.period.label}</p>

            <div className="flex gap-3 mb-5">
              <StatCard label="Total Posts" value={String(reportData.performance.totalPosts)} />
              <StatCard
                label="Avg Engagement"
                value={(reportData.performance.avgEngagementRate * 100).toFixed(1) + '%'}
              />
              <StatCard label="Best Platform" value={reportData.performance.bestPlatform ?? '—'} />
              <StatCard label="Top Theme" value={reportData.performance.topContentTheme ?? '—'} />
            </div>

            <p className="font-sans text-sm text-text-secondary leading-relaxed mb-5">
              {reportData.performance.insightNarrative}
            </p>

            {reportData.performance.byPlatform.length > 0 && (
              <div className="bg-background-secondary border border-background-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-3 px-4 py-2.5 border-b border-background-border">
                  {['Platform', 'Posts', 'Avg Engagement'].map(h => (
                    <span key={h} className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest">
                      {h}
                    </span>
                  ))}
                </div>
                {reportData.performance.byPlatform.map(p => (
                  <div
                    key={p.platform}
                    className="grid grid-cols-3 px-4 py-3 border-b border-background-border last:border-0"
                  >
                    <span className="font-sans text-sm text-text-secondary">{p.platform}</span>
                    <span className="font-mono text-sm text-text-primary">{p.postCount}</span>
                    <span className="font-mono text-sm text-text-primary">
                      {(p.avgEngagementRate * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Strategy */}
          <div>
            <h2 className="font-sans text-lg font-medium text-text-primary mb-4">Next 3 Months Strategy</h2>
            <div className="space-y-4">
              {reportData.strategy.months.map((month, i) => (
                <div
                  key={i}
                  className="bg-background-secondary border border-background-border rounded-xl p-5"
                >
                  <h3 className="font-sans text-sm font-medium text-text-primary mb-3">{month.month}</h3>

                  {month.contentPillars.length > 0 && (
                    <div className="mb-3">
                      <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2">
                        Content Pillars
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {month.contentPillars.map((p, j) => (
                          <span
                            key={j}
                            className="px-2 py-1 bg-background-tertiary border border-background-border rounded-md font-sans text-xs text-text-secondary"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {month.keyDates.length > 0 && (
                    <div className="mb-3">
                      <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2">
                        Key Dates
                      </p>
                      <div className="space-y-2">
                        {month.keyDates.map((d, j) => (
                          <div key={j} className="flex gap-3">
                            <span className="font-sans text-xs font-medium text-text-primary w-32 shrink-0">
                              {d.name}
                            </span>
                            <span className="font-sans text-xs text-text-secondary">{d.campaignIdea}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {month.recommendedFrequency.length > 0 && (
                    <div>
                      <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2">
                        Post Frequency
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {month.recommendedFrequency.map((f, j) => (
                          <div
                            key={j}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-background-tertiary border border-background-border rounded-md"
                          >
                            <span className="font-sans text-xs text-text-secondary">{f.platform}</span>
                            <span className="font-mono text-xs text-text-primary">{f.postsPerWeek}×/week</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lyra/components/lyra/assistant/assistant-report-view.tsx
git commit -m "feat: add AssistantReportView client component with generate, export, and quarter selector"
```

---

### Task 11: Settings branding section

**Files:**
- Create: `lyra/components/lyra/settings/branding-tab.tsx`
- Modify: `lyra/app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`

- [ ] **Step 1: Create the branding tab component**

```typescript
// components/lyra/settings/branding-tab.tsx
'use client'

import { useState, useRef } from 'react'
import { Upload, X } from 'lucide-react'

interface BrandingTabProps {
  workspaceId: string
  hasLogo: boolean
}

export function BrandingTab({ workspaceId, hasLogo: initialHasLogo }: BrandingTabProps) {
  const [hasLogo, setHasLogo] = useState(initialHasLogo)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setError(null)
    setSuccess(null)

    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      setError('File must be PNG, JPG, or SVG.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB.')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await fetch(`/api/workspaces/${workspaceId}/logo`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Upload failed.')
        return
      }
      setHasLogo(true)
      setSuccess('Logo uploaded.')
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setSuccess(null)
    setIsRemoving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/logo`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Remove failed.')
        return
      }
      setHasLogo(false)
      setSuccess('Logo removed.')
    } catch {
      setError('Remove failed. Please try again.')
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-sans text-sm font-medium text-text-primary mb-1">Client Logo</h3>
        <p className="font-sans text-xs text-text-secondary">
          Used in PDF report exports alongside the LYRA mark. PNG, JPG, or SVG. Max 2MB.
        </p>
      </div>

      {hasLogo ? (
        <div className="flex items-center gap-3 p-4 bg-background-secondary border border-background-border rounded-xl">
          <div className="w-2 h-2 rounded-full bg-status-success shrink-0" />
          <span className="font-sans text-sm text-text-primary flex-1">Logo uploaded</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isRemoving}
            className="font-sans text-xs text-text-secondary hover:text-text-primary transition-colors duration-150 disabled:opacity-50"
          >
            Replace
          </button>
          <button
            onClick={handleRemove}
            disabled={isUploading || isRemoving}
            className="font-sans text-xs text-status-error hover:text-status-error/80 transition-colors duration-150 disabled:opacity-50 flex items-center gap-1"
          >
            <X size={12} strokeWidth={1.5} />
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-background-secondary border border-background-border rounded-xl font-sans text-sm text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150 disabled:opacity-50"
        >
          <Upload size={16} strokeWidth={1.5} />
          {isUploading ? 'Uploading…' : 'Upload logo'}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />

      {error && <p className="font-sans text-xs text-status-error">{error}</p>}
      {success && <p className="font-sans text-xs text-status-success">{success}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Read the settings page**

Read `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` to understand the current structure — specifically how sections are laid out and what the workspace select query looks like.

- [ ] **Step 3: Add Branding section to settings page**

Make these targeted edits to `settings/page.tsx`:

1. Add `clientLogoS3Key: true` to the workspace `select` block in the Prisma query.

2. Add the `BrandingTab` import at the top:
```typescript
import { BrandingTab } from '@/components/lyra/settings/branding-tab'
```

3. Add a Branding section. Find the comment or section for "Danger Zone" (it should be near the bottom) and insert before it:

```tsx
{/* Branding */}
<div className="bg-background-secondary border border-background-border rounded-xl p-6 space-y-5">
  <h2 className="font-sans text-lg font-medium text-text-primary">Branding</h2>
  <BrandingTab workspaceId={workspace.id} hasLogo={!!workspace.clientLogoS3Key} />
</div>
```

- [ ] **Step 4: Type check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lyra/components/lyra/settings/branding-tab.tsx lyra/app/(dashboard)/workspace/[workspaceId]/settings/page.tsx
git commit -m "feat: add Branding tab to workspace settings with client logo upload"
```

---

## Final verification

After all 11 tasks complete:

```bash
cd lyra && npm run build
```

Expected: build completes with no errors. If `@react-pdf/renderer` causes issues in the build, verify `serverExternalPackages` is set in `next.config.ts`.

Run tests:

```bash
cd lyra && npx jest --no-coverage
```

Expected: all tests pass.
