# Agency Client Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Generate report" button to the analytics page that produces a branded PDF (cover, stats, platform breakdown, top posts, AI narrative) for 7-day or 30-day periods — PRO/AGENCY only.

**Architecture:** Server-side PDF generation with `@react-pdf/renderer`. Claude writes the narrative paragraph. A single POST endpoint queries DB, calls Claude, renders PDF, and streams bytes back as `application/pdf`. A client-side modal handles the period toggle and download trigger.

**Tech Stack:** `@react-pdf/renderer`, Anthropic Claude API, Next.js App Router API route streaming, React modal component.

**Spec:** `docs/superpowers/specs/2026-05-25-agency-client-reports-design.md`

---

## File Map

| File | Action |
|---|---|
| `package.json` | Add `@react-pdf/renderer` dependency |
| `services/reports/narrative-generator.ts` | New — Claude narrative call |
| `services/reports/report-renderer.ts` | New — `@react-pdf/renderer` PDF builder |
| `app/api/reports/generate/route.ts` | New — POST endpoint, auth + plan gate, queries DB, calls services, streams PDF |
| `components/lyra/analytics/report-generator-modal.tsx` | New — period toggle + generate button + download handler |
| `app/(dashboard)/workspace/[workspaceId]/analytics/page.tsx` | Modified — add Generate Report button |

---

### Task 1: Install dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @react-pdf/renderer**

Run from `lyra/` directory:
```bash
npm install @react-pdf/renderer
npm install --save-dev @types/react-pdf
```

Note: `@react-pdf/renderer` has its own types bundled — the second install may not be needed. If it errors, skip it.

- [ ] **Step 2: Verify install**

```bash
node -e "require('@react-pdf/renderer'); console.log('ok')"
```

Expected: "ok"

- [ ] **Step 3: Commit**

```bash
git add LYRA/lyra/package.json LYRA/lyra/package-lock.json
git commit -m "deps: add @react-pdf/renderer for PDF report generation"
```

---

### Task 2: Narrative generator service

**Files:**
- Create: `services/reports/narrative-generator.ts`

- [ ] **Step 1: Create the shared ReportData type**

Create `lyra/services/reports/report-renderer.ts` placeholder first with just the type (we fill it in Task 3):

```typescript
// Shared type used by both services
export type ReportData = {
  workspaceName: string
  period: '7d' | '30d'
  generatedAt: string
  summary: {
    totalPosts: number
    totalImpressions: number
    totalEngagements: number
    avgEngRate: number
    bestPlatform: string
  }
  platforms: { platform: string; posts: number; impressions: number; engagements: number; engRate: number }[]
  topPosts: { platform: string; scheduledAt: string; contentExcerpt: string; impressions: number; engagements: number }[]
  narrative: string
}
```

- [ ] **Step 2: Create narrative-generator.ts**

Create `lyra/services/reports/narrative-generator.ts`:

```typescript
import { anthropic } from '@/lib/anthropic'
import { ReportData } from './report-renderer'

export async function generateNarrative(data: Omit<ReportData, 'narrative'>): Promise<string> {
  const periodLabel = data.period === '7d' ? 'last 7 days' : 'last 30 days'

  const prompt = `Write a professional 2–3 paragraph performance summary for a social media report.
Tone: direct, analytical, no fluff. Use active voice. Reference actual numbers from the data.
Do not use headings or bullet points — flowing paragraphs only.

Workspace: ${data.workspaceName}
Period: ${periodLabel}
Total posts: ${data.summary.totalPosts}
Total impressions: ${data.summary.totalImpressions.toLocaleString()}
Total engagements: ${data.summary.totalEngagements.toLocaleString()}
Average engagement rate: ${data.summary.avgEngRate.toFixed(2)}%
Best-performing platform: ${data.summary.bestPlatform}

Platform breakdown:
${data.platforms.map((p) => `${p.platform}: ${p.posts} posts, ${p.impressions.toLocaleString()} impressions, ${p.engagements.toLocaleString()} engagements, ${p.engRate.toFixed(2)}% engagement rate`).join('\n')}

Top posts by engagement:
${data.topPosts.map((p, i) => `${i + 1}. ${p.platform} (${p.scheduledAt}): ${p.impressions.toLocaleString()} impressions, ${p.engagements.toLocaleString()} engagements — "${p.contentExcerpt}"`).join('\n')}
`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    return response.content[0].type === 'text' ? response.content[0].text : ''
  } catch {
    // Graceful degradation — report generated without narrative
    return ''
  }
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/services/reports/narrative-generator.ts"
git commit -m "feat: add narrative generator service for client reports"
```

---

### Task 3: PDF renderer service

**Files:**
- Modify: `services/reports/report-renderer.ts` (replace placeholder with full implementation)

- [ ] **Step 1: Write the PDF renderer**

Replace the placeholder content of `lyra/services/reports/report-renderer.ts` with:

```typescript
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

export type ReportData = {
  workspaceName: string
  period: '7d' | '30d'
  generatedAt: string
  summary: {
    totalPosts: number
    totalImpressions: number
    totalEngagements: number
    avgEngRate: number
    bestPlatform: string
  }
  platforms: { platform: string; posts: number; impressions: number; engagements: number; engRate: number }[]
  topPosts: { platform: string; scheduledAt: string; contentExcerpt: string; impressions: number; engagements: number }[]
  narrative: string
}

const styles = StyleSheet.create({
  cover: {
    backgroundColor: '#080808',
    padding: 60,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  page: {
    backgroundColor: '#0f0f0f',
    padding: 48,
    fontFamily: 'Helvetica',
  },
  coverTitle: {
    fontSize: 36,
    color: '#d8d8d8',
    fontFamily: 'Helvetica',
    marginBottom: 8,
  },
  coverSub: {
    fontSize: 14,
    color: '#888888',
    fontFamily: 'Helvetica',
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 16,
    color: '#d8d8d8',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 16,
    marginTop: 24,
  },
  label: {
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Helvetica',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 24,
    color: '#e2e2e2',
    fontFamily: 'Courier',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingVertical: 8,
  },
  cell: {
    flex: 1,
    fontSize: 11,
    color: '#e2e2e2',
    fontFamily: 'Helvetica',
  },
  cellHeader: {
    flex: 1,
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Helvetica',
  },
  narrative: {
    fontSize: 12,
    color: '#888888',
    fontFamily: 'Helvetica',
    lineHeight: 1.7,
  },
  postCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  postMeta: {
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Helvetica',
    marginBottom: 4,
  },
  postExcerpt: {
    fontSize: 12,
    color: '#e2e2e2',
    fontFamily: 'Helvetica',
    marginBottom: 6,
  },
  postMetrics: {
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Courier',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  summaryItem: {
    width: '45%',
  },
})

function CoverPage({ data }: { data: ReportData }) {
  const periodLabel = data.period === '7d' ? 'Last 7 days' : 'Last 30 days'
  return (
    <Page size="A4" style={styles.cover}>
      <View>
        <Text style={styles.coverTitle}>LYRA</Text>
        <Text style={styles.coverSub}>{data.workspaceName}</Text>
        <Text style={styles.coverSub}>{periodLabel}</Text>
        <Text style={styles.coverSub}>Generated {data.generatedAt}</Text>
      </View>
    </Page>
  )
}

function ContentPage({ data }: { data: ReportData }) {
  return (
    <Page size="A4" style={styles.page}>
      {/* Executive Summary */}
      <Text style={styles.sectionHeading}>Executive Summary</Text>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <Text style={styles.label}>Posts published</Text>
          <Text style={styles.value}>{data.summary.totalPosts}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.label}>Total impressions</Text>
          <Text style={styles.value}>{data.summary.totalImpressions.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.label}>Total engagements</Text>
          <Text style={styles.value}>{data.summary.totalEngagements.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.label}>Avg. engagement rate</Text>
          <Text style={styles.value}>{data.summary.avgEngRate.toFixed(2)}%</Text>
        </View>
      </View>
      <Text style={styles.label}>Best platform</Text>
      <Text style={{ fontSize: 14, color: '#e2e2e2', fontFamily: 'Helvetica', marginBottom: 24 }}>
        {data.summary.bestPlatform}
      </Text>

      {/* Platform Breakdown */}
      <Text style={styles.sectionHeading}>Platform Breakdown</Text>
      <View style={styles.row}>
        {['Platform', 'Posts', 'Impressions', 'Engagements', 'Eng. Rate'].map((h) => (
          <Text key={h} style={styles.cellHeader}>{h}</Text>
        ))}
      </View>
      {data.platforms.map((p) => (
        <View key={p.platform} style={styles.row}>
          <Text style={styles.cell}>{p.platform}</Text>
          <Text style={styles.cell}>{p.posts}</Text>
          <Text style={styles.cell}>{p.impressions.toLocaleString()}</Text>
          <Text style={styles.cell}>{p.engagements.toLocaleString()}</Text>
          <Text style={styles.cell}>{p.engRate.toFixed(2)}%</Text>
        </View>
      ))}

      {/* Top Posts */}
      <Text style={styles.sectionHeading}>Top Posts</Text>
      {data.topPosts.map((post, i) => (
        <View key={i} style={styles.postCard}>
          <Text style={styles.postMeta}>{post.platform} · {post.scheduledAt}</Text>
          <Text style={styles.postExcerpt}>{post.contentExcerpt}</Text>
          <Text style={styles.postMetrics}>
            {post.impressions.toLocaleString()} impressions · {post.engagements.toLocaleString()} engagements
          </Text>
        </View>
      ))}

      {/* AI Narrative */}
      {data.narrative.length > 0 && (
        <>
          <Text style={styles.sectionHeading}>Performance Analysis</Text>
          <Text style={styles.narrative}>{data.narrative}</Text>
        </>
      )}
    </Page>
  )
}

export async function renderReport(data: ReportData): Promise<Buffer> {
  const doc = React.createElement(
    Document,
    null,
    React.createElement(CoverPage, { data }),
    React.createElement(ContentPage, { data })
  )
  return renderToBuffer(doc) as Promise<Buffer>
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. Note: `@react-pdf/renderer` types may show minor warnings — acceptable.

- [ ] **Step 3: Commit**

```bash
git add "LYRA/lyra/services/reports/report-renderer.ts"
git commit -m "feat: add PDF report renderer using @react-pdf/renderer"
```

---

### Task 4: Report generation API endpoint

**Files:**
- Create: `app/api/reports/generate/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `lyra/app/api/reports/generate/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNarrative } from '@/services/reports/narrative-generator'
import { renderReport, ReportData } from '@/services/reports/report-renderer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, period } = await req.json() as { workspaceId: string; period: '7d' | '30d' }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, name: true, plan: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Reports require PRO or AGENCY plan.' }, { status: 403 })
    }

    const days = period === '7d' ? 7 : 30
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - days)

    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        status: 'PUBLISHED',
        scheduledAt: { gte: periodStart },
      },
      include: { metrics: true },
      orderBy: { scheduledAt: 'desc' },
    })

    // Build platform stats
    const platformMap: Record<string, { posts: number; impressions: number; engagements: number }> = {}
    for (const post of posts) {
      if (!post.metrics) continue
      const p = post.platforms[0] ?? 'UNKNOWN'
      if (!platformMap[p]) platformMap[p] = { posts: 0, impressions: 0, engagements: 0 }
      platformMap[p].posts++
      platformMap[p].impressions += post.metrics.impressions ?? 0
      platformMap[p].engagements += post.metrics.engagements ?? 0
    }

    const platforms = Object.entries(platformMap).map(([platform, s]) => ({
      platform,
      posts: s.posts,
      impressions: s.impressions,
      engagements: s.engagements,
      engRate: s.impressions > 0 ? (s.engagements / s.impressions) * 100 : 0,
    }))

    const totalImpressions = platforms.reduce((sum, p) => sum + p.impressions, 0)
    const totalEngagements = platforms.reduce((sum, p) => sum + p.engagements, 0)
    const bestPlatform = platforms.sort((a, b) => b.engagements - a.engagements)[0]?.platform ?? 'N/A'
    const avgEngRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0

    const topPosts = posts
      .filter((p) => p.metrics)
      .sort((a, b) => (b.metrics!.engagements ?? 0) - (a.metrics!.engagements ?? 0))
      .slice(0, 3)
      .map((p) => ({
        platform: p.platforms[0] ?? 'UNKNOWN',
        scheduledAt: p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString() : '',
        contentExcerpt: (p.content ?? '').slice(0, 120),
        impressions: p.metrics!.impressions ?? 0,
        engagements: p.metrics!.engagements ?? 0,
      }))

    const reportDataWithoutNarrative = {
      workspaceName: workspace.name,
      period,
      generatedAt: new Date().toLocaleDateString(),
      summary: { totalPosts: posts.length, totalImpressions, totalEngagements, avgEngRate, bestPlatform },
      platforms,
      topPosts,
      narrative: '',
    }

    const narrative = await generateNarrative(reportDataWithoutNarrative)
    const reportData: ReportData = { ...reportDataWithoutNarrative, narrative }

    const pdfBuffer = await renderReport(reportData)

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="lyra-report-${period}-${Date.now()}.pdf"`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Report generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/api/reports/generate/route.ts"
git commit -m "feat: add report generation API endpoint"
```

---

### Task 5: Report modal component

**Files:**
- Create: `components/lyra/analytics/report-generator-modal.tsx`

- [ ] **Step 1: Create the modal**

Create `lyra/components/lyra/analytics/report-generator-modal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { FileText, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ReportGeneratorModalProps {
  workspaceId: string
  open: boolean
  onClose: () => void
}

export function ReportGeneratorModal({ workspaceId, open, onClose }: ReportGeneratorModalProps) {
  const [period, setPeriod] = useState<'7d' | '30d'>('30d')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, period }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Report generation failed.')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lyra-report-${period}-${Date.now()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      setError('Report generation failed. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-background-secondary border-background-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-sans font-medium text-text-primary">Generate report</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex rounded-lg border border-background-border overflow-hidden">
            {(['7d', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2 text-sm font-sans transition-colors ${
                  period === p
                    ? 'bg-accent-platinum text-background-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-sm text-status-error font-sans">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent-platinum text-background-primary text-sm font-medium font-sans hover:bg-accent-white transition-colors disabled:opacity-50"
          >
            {generating ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-background-primary/30 border-t-background-primary animate-spin" />
                Generating PDF…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" strokeWidth={1.5} />
                Generate PDF
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/analytics/report-generator-modal.tsx"
git commit -m "feat: add report generator modal component"
```

---

### Task 6: Add Generate Report button to analytics page

**Files:**
- Modify: `app/(dashboard)/workspace/[workspaceId]/analytics/page.tsx`

- [ ] **Step 1: Read the analytics page**

Read `lyra/app/(dashboard)/workspace/[workspaceId]/analytics/page.tsx` to understand the current header structure.

- [ ] **Step 2: Convert page to client component or add a client wrapper**

The analytics page is likely a server component. Add a small `ReportButton` client wrapper at the top of the file:

```tsx
'use client'
// Add at the very top of the file OR create a separate file

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { ReportGeneratorModal } from '@/components/lyra/analytics/report-generator-modal'

export function ReportButton({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-background-border text-sm font-medium font-sans text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors"
      >
        <FileText className="h-4 w-4" strokeWidth={1.5} />
        Generate report
      </button>
      <ReportGeneratorModal workspaceId={workspaceId} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

If the analytics page is a server component, create `components/lyra/analytics/report-button.tsx` with this content, then import `<ReportButton workspaceId={workspaceId} />` into the analytics page header area.

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/(dashboard)/workspace/[workspaceId]/analytics/page.tsx"
git add "LYRA/lyra/components/lyra/analytics/report-button.tsx" 2>/dev/null || true
git add "LYRA/lyra/components/lyra/analytics/report-generator-modal.tsx"
git commit -m "feat: add Generate Report button to analytics page"
```

---

### Task 7: Push to GitHub

- [ ] **Step 1: Final type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Push from outer repo**

```bash
cd "c:/Users/Rich/OneDrive - Into The Wild Marketing"
git push origin main
```
