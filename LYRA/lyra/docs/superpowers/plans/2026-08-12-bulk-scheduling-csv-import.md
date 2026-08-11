# Bulk Scheduling / CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an agency download a workspace-scoped `.xlsx` template, fill it in with a month of posts, upload it, review every row's validation status, and commit the ready ones as real posts — without ever leaving the calendar.

**Architecture:** A locked `.xlsx` template (not flexible column mapping) with a Platform dropdown scoped to the workspace's connected accounts. Upload → parse → per-row validation (pure function, fully unit tested) → review screen (nothing written yet) → commit (creates real `Post` rows through the exact same approval-routing rule `POST /api/posts` already uses). No schema changes — this reuses existing `Post`, `SocialAccount`, and `Workspace` data.

**Tech Stack:** Next.js App Router API routes, Prisma, `exceljs` (new dependency) for reading/writing the `.xlsx` file, the existing `safeFetch` (SSRF-hardened) and `putObjectBuffer` (S3) helpers for media re-hosting.

**Spec:** `docs/superpowers/specs/2026-08-12-bulk-scheduling-csv-import-design.md`

---

### Task 1: Template generator + template API route

**Files:**
- Create: `lib/xlsx-template.ts`
- Test: `lib/xlsx-template.test.ts`
- Create: `app/api/workspaces/[id]/bulk-import/template/route.ts`
- Test: `app/api/workspaces/[id]/bulk-import/template/route.test.ts`

- [ ] **Step 1: Install the new dependency**

Run: `cd LYRA/lyra && npm install exceljs`
Expected: `package.json` and `package-lock.json` both change, adding `exceljs` under `dependencies`.

- [ ] **Step 2: Write the failing tests for the template generator**

```typescript
// lib/xlsx-template.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildBulkImportTemplate, BULK_IMPORT_HEADER_ROW } from './xlsx-template'

describe('buildBulkImportTemplate', () => {
  it('produces a workbook with a Posts sheet and the expected headers', async () => {
    const buffer = await buildBulkImportTemplate(['FACEBOOK', 'INSTAGRAM'])
    expect(buffer.length).toBeGreaterThan(0)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Posts')
    expect(sheet).toBeDefined()

    const headerRow = sheet!.getRow(BULK_IMPORT_HEADER_ROW)
    expect(headerRow.values).toEqual([undefined, 'Date', 'Time', 'Platform', 'Caption', 'Media URL'])
  })

  it('adds a Platform dropdown scoped to the connected platforms', async () => {
    const buffer = await buildBulkImportTemplate(['FACEBOOK', 'INSTAGRAM'])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Posts')!

    const validation = sheet.dataValidations.find('C4')
    expect(validation).toBeDefined()
    expect(validation!.formulae).toEqual(['"FACEBOOK,INSTAGRAM"'])
  })

  it('omits the dropdown when the workspace has no connected platforms', async () => {
    const buffer = await buildBulkImportTemplate([])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Posts')!

    const validation = sheet.dataValidations.find('C4')
    expect(validation).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd LYRA/lyra && npx vitest run lib/xlsx-template.test.ts`
Expected: FAIL — `Cannot find module './xlsx-template'`

- [ ] **Step 4: Implement the template generator**

```typescript
// lib/xlsx-template.ts
import ExcelJS from 'exceljs'

// Exported so lib/xlsx-parser.ts (Task 2) reads data starting from the exact
// row this file writes to -- one source of truth for the layout instead of
// the same magic numbers duplicated between generator and parser.
export const BULK_IMPORT_HEADER_ROW = 2
export const BULK_IMPORT_FIRST_DATA_ROW = 4

const MAX_DATA_ROWS = 500
const LAST_DATA_ROW = BULK_IMPORT_FIRST_DATA_ROW + MAX_DATA_ROWS - 1

/**
 * Generates the downloadable bulk-import template for a workspace. The
 * Platform column is a locked dropdown restricted to `connectedPlatforms` --
 * the same set POST /api/posts would actually accept for this workspace --
 * so a row can never target a platform this workspace isn't connected to.
 */
export async function buildBulkImportTemplate(connectedPlatforms: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Posts')

  sheet.getColumn(1).width = 14 // Date
  sheet.getColumn(2).width = 10 // Time
  sheet.getColumn(3).width = 16 // Platform
  sheet.getColumn(4).width = 50 // Caption
  sheet.getColumn(5).width = 40 // Media URL

  sheet.mergeCells('A1:E1')
  sheet.getCell('A1').value =
    'Fill in one row per post. Date: YYYY-MM-DD. Time: 24-hour HH:MM, in your workspace timezone. ' +
    'Platform: pick from the dropdown. Media URL is optional -- leave blank for a text-only post. ' +
    'Delete the example row below before uploading.'
  sheet.getCell('A1').font = { italic: true, size: 10 }
  sheet.getCell('A1').alignment = { wrapText: true }

  const headerRow = sheet.getRow(BULK_IMPORT_HEADER_ROW)
  headerRow.values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
  headerRow.font = { bold: true }

  const exampleRow = sheet.getRow(BULK_IMPORT_FIRST_DATA_ROW - 1)
  exampleRow.values = [
    '2026-09-01',
    '09:00',
    connectedPlatforms[0] ?? '',
    'EXAMPLE -- delete this row before uploading',
    '',
  ]
  exampleRow.font = { italic: true, color: { argb: 'FF999999' } }

  if (connectedPlatforms.length > 0) {
    sheet.dataValidations.add(`C${BULK_IMPORT_FIRST_DATA_ROW}:C${LAST_DATA_ROW}`, {
      type: 'list',
      allowBlank: false,
      formulae: [`"${connectedPlatforms.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid platform',
      error: "Choose a platform from the dropdown. Only this workspace's connected platforms are valid.",
    })
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd LYRA/lyra && npx vitest run lib/xlsx-template.test.ts`
Expected: PASS (3/3)

If `dataValidations.find` isn't the exact method name on the installed `exceljs` version, check `node_modules/exceljs/index.d.ts` for the real `DataValidations` API and adjust the test accordingly — the behavior under test (a dropdown scoped to connected platforms, omitted when empty) does not change, only the exact assertion call might.

- [ ] **Step 6: Write the failing tests for the template API route**

```typescript
// app/api/workspaces/[id]/bulk-import/template/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    socialAccount: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/xlsx-template', () => ({ buildBulkImportTemplate: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildBulkImportTemplate } from '@/lib/xlsx-template'
import { GET } from './route'

function ctx(id = 'ws-1') {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/workspaces/[id]/bulk-import/template', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for a CLIENT_VIEW role', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as any)

    const res = await GET(new Request('http://localhost'), ctx())
    expect(res.status).toBe(403)
    expect(buildBulkImportTemplate).not.toHaveBeenCalled()
  })

  it('streams the xlsx with the correct headers, built from deduped connected platforms', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([
      { platform: 'FACEBOOK' },
      { platform: 'FACEBOOK' },
      { platform: 'INSTAGRAM' },
    ] as any)
    vi.mocked(buildBulkImportTemplate).mockResolvedValue(Buffer.from('fake-xlsx'))

    const res = await GET(new Request('http://localhost'), ctx())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    expect(buildBulkImportTemplate).toHaveBeenCalledWith(['FACEBOOK', 'INSTAGRAM'])
  })
})
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd LYRA/lyra && npx vitest run "app/api/workspaces/[id]/bulk-import/template/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 8: Implement the template API route**

```typescript
// app/api/workspaces/[id]/bulk-import/template/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { buildBulkImportTemplate } from '@/lib/xlsx-template'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const socialAccounts = await prisma.socialAccount.findMany({
      where: { workspaceId, isActive: true },
      select: { platform: true },
    })
    const connectedPlatforms = [...new Set(socialAccounts.map((a) => a.platform))]

    const buffer = await buildBulkImportTemplate(connectedPlatforms)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="lyra-bulk-import-template.xlsx"',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/workspaces/[id]/bulk-import/template error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd LYRA/lyra && npx vitest run "app/api/workspaces/[id]/bulk-import/template/route.test.ts"`
Expected: PASS (2/2)

- [ ] **Step 10: Commit**

```bash
git add lib/xlsx-template.ts lib/xlsx-template.test.ts "app/api/workspaces/[id]/bulk-import/template/" package.json package-lock.json
git commit -m "feat: bulk import template generator + download route"
```

---

### Task 2: XLSX parser + row-validation service

This is the task with the real business logic. Both files are pure functions with no I/O dependencies except the two already-injected/mockable helpers (`checkMediaCompatibility`, `safeFetch`), so both are fully unit testable without a real request or database.

**Files:**
- Create: `lib/xlsx-parser.ts`
- Test: `lib/xlsx-parser.test.ts`
- Create: `services/posts/bulk-import.ts`
- Test: `services/posts/bulk-import.test.ts`

- [ ] **Step 1: Write the failing tests for the parser**

```typescript
// lib/xlsx-parser.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseBulkImportFile } from './xlsx-parser'
import { BULK_IMPORT_HEADER_ROW, BULK_IMPORT_FIRST_DATA_ROW } from './xlsx-template'

async function buildFixture(dataRows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Posts')
  sheet.getRow(BULK_IMPORT_HEADER_ROW).values = ['Date', 'Time', 'Platform', 'Caption', 'Media URL']
  dataRows.forEach((values, i) => {
    sheet.getRow(BULK_IMPORT_FIRST_DATA_ROW + i).values = values
  })
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

describe('parseBulkImportFile', () => {
  it('extracts each data row starting after the header, tagged with its real row number', async () => {
    const buffer = await buildFixture([
      ['2026-07-15', '09:00', 'FACEBOOK', 'Hello', 'https://example.com/a.jpg'],
      ['2026-07-16', '10:00', 'INSTAGRAM', 'World', ''],
    ])
    const rows = await parseBulkImportFile(buffer)
    expect(rows).toEqual([
      {
        rowNumber: BULK_IMPORT_FIRST_DATA_ROW,
        date: '2026-07-15', time: '09:00', platform: 'FACEBOOK',
        caption: 'Hello', mediaUrl: 'https://example.com/a.jpg',
      },
      {
        rowNumber: BULK_IMPORT_FIRST_DATA_ROW + 1,
        date: '2026-07-16', time: '10:00', platform: 'INSTAGRAM',
        caption: 'World', mediaUrl: '',
      },
    ])
  })

  it('skips a fully empty row rather than reporting it as data', async () => {
    const buffer = await buildFixture([
      ['2026-07-15', '09:00', 'FACEBOOK', 'Hello', ''],
      ['', '', '', '', ''],
    ])
    const rows = await parseBulkImportFile(buffer)
    expect(rows).toHaveLength(1)
  })

  it('returns an empty array when the Posts sheet is missing', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('SomethingElse')
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    const rows = await parseBulkImportFile(buffer)
    expect(rows).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd LYRA/lyra && npx vitest run lib/xlsx-parser.test.ts`
Expected: FAIL — `Cannot find module './xlsx-parser'`

- [ ] **Step 3: Implement the parser**

```typescript
// lib/xlsx-parser.ts
import ExcelJS from 'exceljs'
import { BULK_IMPORT_FIRST_DATA_ROW } from './xlsx-template'

export interface RawImportRow {
  rowNumber: number
  date: string
  time: string
  platform: string
  caption: string
  mediaUrl: string
}

/**
 * Pure cell extraction -- no business validation here. That lives in
 * services/posts/bulk-import.ts, which takes this file's output as its input.
 */
export async function parseBulkImportFile(buffer: Buffer): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet('Posts')
  if (!sheet) return []

  const rows: RawImportRow[] = []
  for (let rowNumber = BULK_IMPORT_FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const [, date, time, platform, caption, mediaUrl] = row.values as unknown[]
    // A fully empty row is the end of real data, not a row to report --
    // exceljs's sheet.rowCount can extend past the last row a user actually
    // typed into if any row past it has styling applied.
    if (!date && !time && !platform && !caption && !mediaUrl) continue
    rows.push({
      rowNumber,
      date: String(date ?? '').trim(),
      time: String(time ?? '').trim(),
      platform: String(platform ?? '').trim(),
      caption: String(caption ?? '').trim(),
      mediaUrl: String(mediaUrl ?? '').trim(),
    })
  }
  return rows
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd LYRA/lyra && npx vitest run lib/xlsx-parser.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Write the failing tests for row validation**

```typescript
// services/posts/bulk-import.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }))

import { safeFetch } from '@/lib/safe-fetch'
import { validateImportRow, validateImportRows } from './bulk-import'
import type { RawImportRow } from '@/lib/xlsx-parser'

const ACCOUNTS = [
  { id: 'acc-fb', platform: 'FACEBOOK' as const },
  { id: 'acc-ig', platform: 'INSTAGRAM' as const },
]

function row(overrides: Partial<RawImportRow> = {}): RawImportRow {
  return {
    rowNumber: 4,
    date: '2026-07-15',
    time: '09:00',
    platform: 'FACEBOOK',
    caption: 'Hello world',
    mediaUrl: '',
    ...overrides,
  }
}

describe('validateImportRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('flags a missing required field as an error', async () => {
    const result = await validateImportRow(row({ caption: '' }), ACCOUNTS, 'Australia/Sydney')
    expect(result.status).toBe('error')
    expect(result.reason).toContain('required')
  })

  it('flags an unrecognised platform value as an error', async () => {
    const result = await validateImportRow(row({ platform: 'Facbook' }), ACCOUNTS, 'Australia/Sydney')
    expect(result.status).toBe('error')
    expect(result.reason).toContain('not a recognised platform')
  })

  it('flags a platform with no connected account as an error', async () => {
    const result = await validateImportRow(row({ platform: 'TIKTOK' }), ACCOUNTS, 'Australia/Sydney')
    expect(result.status).toBe('error')
    expect(result.reason).toContain('no connected TIKTOK account')
  })

  it('flags an unparseable date/time as an error', async () => {
    const result = await validateImportRow(row({ date: '15/07/2026' }), ACCOUNTS, 'Australia/Sydney')
    expect(result.status).toBe('error')
    expect(result.reason).toContain('could not be parsed')
  })

  it('resolves the platform to its connected socialAccountId and converts workspace-local time to UTC', async () => {
    const result = await validateImportRow(row(), ACCOUNTS, 'Australia/Sydney')
    expect(result.status).toBe('ready')
    expect(result.post).toMatchObject({
      socialAccountId: 'acc-fb',
      platform: 'FACEBOOK',
      content: 'Hello world',
      // 09:00 in Sydney (UTC+10 in July -- Southern Hemisphere winter, no DST)
      // is 23:00 UTC the previous day.
      scheduledAt: '2026-07-14T23:00:00.000Z',
      mediaUrl: null,
    })
  })

  it('flags a known-bad media/platform combination as an error, without attempting a fetch', async () => {
    const result = await validateImportRow(
      row({ platform: 'INSTAGRAM', mediaUrl: 'https://example.com/photo.gif' }),
      ACCOUNTS,
      'Australia/Sydney'
    )
    expect(result.status).toBe('error')
    expect(result.reason).toContain('does not accept this media format')
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('keeps the media URL and marks the row ready when the HEAD check succeeds with an image content-type', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
    } as any)

    const result = await validateImportRow(
      row({ mediaUrl: 'https://example.com/photo.jpg' }),
      ACCOUNTS,
      'Australia/Sydney'
    )
    expect(result.status).toBe('ready')
    expect(result.post?.mediaUrl).toBe('https://example.com/photo.jpg')
    expect(safeFetch).toHaveBeenCalledWith('https://example.com/photo.jpg', { method: 'HEAD' })
  })

  it('drops the media URL and warns, without erroring the row, when the HEAD check fails', async () => {
    vi.mocked(safeFetch).mockResolvedValue({ ok: false, headers: { get: () => null } } as any)

    const result = await validateImportRow(
      row({ mediaUrl: 'https://example.com/dead-link' }),
      ACCOUNTS,
      'Australia/Sydney'
    )
    expect(result.status).toBe('warning')
    expect(result.post?.mediaUrl).toBeNull()
  })

  it('drops the media URL and warns when safeFetch throws (e.g. blocked by SSRF validation)', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('blocked'))

    const result = await validateImportRow(
      row({ mediaUrl: 'https://example.com/blocked' }),
      ACCOUNTS,
      'Australia/Sydney'
    )
    expect(result.status).toBe('warning')
    expect(result.post?.mediaUrl).toBeNull()
  })

  it('never calls safeFetch when no media URL is given', async () => {
    const result = await validateImportRow(row(), ACCOUNTS, 'Australia/Sydney')
    expect(result.status).toBe('ready')
    expect(safeFetch).not.toHaveBeenCalled()
  })
})

describe('validateImportRows', () => {
  it('validates every row independently and preserves row order', async () => {
    const rows = [row({ rowNumber: 4 }), row({ rowNumber: 5, caption: '' })]
    const results = await validateImportRows(rows, ACCOUNTS, 'Australia/Sydney')
    expect(results.map((r) => r.rowNumber)).toEqual([4, 5])
    expect(results[0].status).toBe('ready')
    expect(results[1].status).toBe('error')
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd LYRA/lyra && npx vitest run services/posts/bulk-import.test.ts`
Expected: FAIL — `Cannot find module './bulk-import'`

- [ ] **Step 7: Implement the row-validation service**

```typescript
// services/posts/bulk-import.ts
import type { Platform } from '@prisma/client'
import { checkMediaCompatibility } from '@/services/social/media-compatibility'
import { safeFetch } from '@/lib/safe-fetch'
import type { RawImportRow } from '@/lib/xlsx-parser'

export interface ConnectedAccount {
  id: string
  platform: Platform
}

export type ImportRowStatus = 'ready' | 'warning' | 'error'

export interface ValidatedImportRow {
  rowNumber: number
  status: ImportRowStatus
  reason?: string
  post?: {
    socialAccountId: string
    platform: Platform
    content: string
    scheduledAt: string // ISO
    mediaUrl: string | null
  }
}

const PLATFORM_VALUES = new Set<string>([
  'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TIKTOK', 'TWITTER',
  'GOOGLE_BUSINESS', 'YOUTUBE', 'PINTEREST', 'THREADS', 'BLUESKY',
])

/**
 * Combines "YYYY-MM-DD" + "HH:MM" and interprets it in the workspace's own
 * timezone, matching how the Calendar/Composer already treat scheduling
 * times -- not the server's own local timezone.
 */
function parseScheduledAt(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const naive = new Date(`${date}T${time}:00`)
  if (Number.isNaN(naive.getTime())) return null

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(naive).reduce(
    (acc, p) => ({ ...acc, [p.type]: p.value }),
    {} as Record<string, string>
  )
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  const offsetMs = asIfUtc - naive.getTime()
  return new Date(naive.getTime() - offsetMs)
}

export async function validateImportRow(
  row: RawImportRow,
  connectedAccounts: ConnectedAccount[],
  timeZone: string
): Promise<ValidatedImportRow> {
  if (!row.date || !row.time || !row.platform || !row.caption) {
    return {
      rowNumber: row.rowNumber, status: 'error',
      reason: 'Missing a required field (Date, Time, Platform, or Caption).',
    }
  }

  if (!PLATFORM_VALUES.has(row.platform)) {
    return { rowNumber: row.rowNumber, status: 'error', reason: `"${row.platform}" is not a recognised platform.` }
  }
  const platform = row.platform as Platform

  const account = connectedAccounts.find((a) => a.platform === platform)
  if (!account) {
    return {
      rowNumber: row.rowNumber, status: 'error',
      reason: `This workspace has no connected ${platform} account.`,
    }
  }

  const scheduledAt = parseScheduledAt(row.date, row.time, timeZone)
  if (!scheduledAt) {
    return {
      rowNumber: row.rowNumber, status: 'error',
      reason: 'Date/Time could not be parsed. Use YYYY-MM-DD and 24-hour HH:MM.',
    }
  }

  let mediaUrl: string | null = row.mediaUrl || null
  let warning: string | undefined

  if (mediaUrl) {
    const issues = checkMediaCompatibility([mediaUrl], [platform])
    if (issues.length > 0) {
      return { rowNumber: row.rowNumber, status: 'error', reason: `${platform} does not accept this media format.` }
    }

    try {
      const res = await safeFetch(mediaUrl, { method: 'HEAD' })
      const contentType = res.headers.get('content-type') ?? ''
      if (!res.ok || !(contentType.startsWith('image/') || contentType.startsWith('video/'))) {
        warning = 'Media URL is unreachable or not an image/video. Post will import without media.'
        mediaUrl = null
      }
    } catch {
      warning = 'Media URL is unreachable. Post will import without media.'
      mediaUrl = null
    }
  }

  return {
    rowNumber: row.rowNumber,
    status: warning ? 'warning' : 'ready',
    reason: warning,
    post: {
      socialAccountId: account.id,
      platform,
      content: row.caption,
      scheduledAt: scheduledAt.toISOString(),
      mediaUrl,
    },
  }
}

export async function validateImportRows(
  rows: RawImportRow[],
  connectedAccounts: ConnectedAccount[],
  timeZone: string
): Promise<ValidatedImportRow[]> {
  return Promise.all(rows.map((row) => validateImportRow(row, connectedAccounts, timeZone)))
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd LYRA/lyra && npx vitest run services/posts/bulk-import.test.ts`
Expected: PASS (10/10)

- [ ] **Step 9: Commit**

```bash
git add lib/xlsx-parser.ts lib/xlsx-parser.test.ts services/posts/bulk-import.ts services/posts/bulk-import.test.ts
git commit -m "feat: bulk import row parsing and validation"
```

---

### Task 3: Parse API route

**Files:**
- Create: `app/api/workspaces/[id]/bulk-import/parse/route.ts`
- Test: `app/api/workspaces/[id]/bulk-import/parse/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/workspaces/[id]/bulk-import/parse/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    socialAccount: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/xlsx-parser', () => ({ parseBulkImportFile: vi.fn() }))
vi.mock('@/services/posts/bulk-import', () => ({ validateImportRows: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBulkImportFile } from '@/lib/xlsx-parser'
import { validateImportRows } from '@/services/posts/bulk-import'
import { POST } from './route'

function ctx(id = 'ws-1') {
  return { params: Promise.resolve({ id }) }
}

function reqWithFile() {
  const form = new FormData()
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'import.xlsx'))
  return new Request('http://localhost', { method: 'POST', body: form })
}

describe('POST /api/workspaces/[id]/bulk-import/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ timezone: 'Australia/Sydney' } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'acc-fb', platform: 'FACEBOOK' }] as any)
  })

  it('returns 403 for a CLIENT_VIEW role, without parsing the file', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as any)
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(403)
    expect(parseBulkImportFile).not.toHaveBeenCalled()
  })

  it('returns 400 when no file is attached', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: new FormData() }), ctx())
    expect(res.status).toBe(400)
  })

  it('rejects a file with more than 500 rows before validating any of them', async () => {
    vi.mocked(parseBulkImportFile).mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({
        rowNumber: i + 4, date: '', time: '', platform: '', caption: '', mediaUrl: '',
      }))
    )
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(422)
    expect(validateImportRows).not.toHaveBeenCalled()
  })

  it('parses, validates against the workspace timezone and connected accounts, and returns the results', async () => {
    vi.mocked(parseBulkImportFile).mockResolvedValue([
      { rowNumber: 4, date: '2026-07-15', time: '09:00', platform: 'FACEBOOK', caption: 'Hi', mediaUrl: '' },
    ])
    vi.mocked(validateImportRows).mockResolvedValue([{ rowNumber: 4, status: 'ready' }] as any)

    const res = await POST(reqWithFile(), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ rows: [{ rowNumber: 4, status: 'ready' }] })
    expect(validateImportRows).toHaveBeenCalledWith(
      [{ rowNumber: 4, date: '2026-07-15', time: '09:00', platform: 'FACEBOOK', caption: 'Hi', mediaUrl: '' }],
      [{ id: 'acc-fb', platform: 'FACEBOOK' }],
      'Australia/Sydney'
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd LYRA/lyra && npx vitest run "app/api/workspaces/[id]/bulk-import/parse/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

```typescript
// app/api/workspaces/[id]/bulk-import/parse/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { parseBulkImportFile } from '@/lib/xlsx-parser'
import { validateImportRows } from '@/services/posts/bulk-import'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 500

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const rawRows = await parseBulkImportFile(buffer)

    if (rawRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `This file has ${rawRows.length} rows; the limit is ${MAX_ROWS} per import.` },
        { status: 422 }
      )
    }

    const [workspace, socialAccounts] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } }),
      prisma.socialAccount.findMany({ where: { workspaceId, isActive: true }, select: { id: true, platform: true } }),
    ])

    const results = await validateImportRows(rawRows, socialAccounts, workspace?.timezone ?? 'UTC')

    return NextResponse.json({ rows: results })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/workspaces/[id]/bulk-import/parse error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd LYRA/lyra && npx vitest run "app/api/workspaces/[id]/bulk-import/parse/route.test.ts"`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add "app/api/workspaces/[id]/bulk-import/parse/"
git commit -m "feat: bulk import parse route"
```

---

### Task 4: Commit API route

**Files:**
- Create: `app/api/workspaces/[id]/bulk-import/commit/route.ts`
- Test: `app/api/workspaces/[id]/bulk-import/commit/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/workspaces/[id]/bulk-import/commit/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    post: { create: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }))
vi.mock('@/lib/s3', () => ({ putObjectBuffer: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { safeFetch } from '@/lib/safe-fetch'
import { putObjectBuffer } from '@/lib/s3'
import { POST } from './route'

function ctx(id = 'ws-1') {
  return { params: Promise.resolve({ id }) }
}

function req(rows: unknown[]) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
}

const ROW = {
  socialAccountId: 'acc-fb',
  content: 'Hello',
  scheduledAt: '2026-07-14T23:00:00.000Z',
  mediaUrl: null,
}

describe('POST /api/workspaces/[id]/bulk-import/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.create).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    process.env.AWS_S3_BUCKET = 'lyra-media'
    process.env.S3_REGION = 'ap-southeast-2'
  })

  it('returns 403 for a CLIENT_VIEW role', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      role: 'CLIENT_VIEW', workspace: { clientAccessLevel: 'NONE' },
    } as any)
    const res = await POST(req([ROW]), ctx())
    expect(res.status).toBe(403)
  })

  it('returns 400 when rows is missing or empty', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'NONE' },
    } as any)
    const res = await POST(req([]), ctx())
    expect(res.status).toBe(400)
  })

  it('creates posts directly as SCHEDULED when the workspace does not require approval', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'NONE' },
    } as any)

    const res = await POST(req([ROW]), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) })
    )
  })

  it('routes to PENDING_APPROVAL when the workspace requires client approval, same as any other creation path', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'APPROVE' },
    } as any)

    await POST(req([ROW]), ctx())

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) })
    )
  })

  it('creates every row in a single transaction', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'NONE' },
    } as any)

    await POST(req([ROW, { ...ROW, socialAccountId: 'acc-ig' }]), ctx())

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.post.create).toHaveBeenCalledTimes(2)
  })

  it('re-hosts a reachable media URL to S3 and stores the resulting LYRA URL, not the original', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'NONE' },
    } as any)
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(4),
    } as any)

    await POST(req([{ ...ROW, mediaUrl: 'https://example.com/photo.jpg' }]), ctx())

    expect(putObjectBuffer).toHaveBeenCalledTimes(1)
    const createCall = vi.mocked(prisma.post.create).mock.calls[0][0] as any
    expect(createCall.data.mediaUrls[0]).toMatch(
      /^https:\/\/lyra-media\.s3\.ap-southeast-2\.amazonaws\.com\/media\/ws-1\//
    )
  })

  it('still creates the post, without media, when the re-fetch fails at commit time even though it looked reachable at parse time', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'NONE' },
    } as any)
    vi.mocked(safeFetch).mockRejectedValue(new Error('gone'))

    const res = await POST(req([{ ...ROW, mediaUrl: 'https://example.com/now-dead.jpg' }]), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    const createCall = vi.mocked(prisma.post.create).mock.calls[0][0] as any
    expect(createCall.data.mediaUrls).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd LYRA/lyra && npx vitest run "app/api/workspaces/[id]/bulk-import/commit/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

```typescript
// app/api/workspaces/[id]/bulk-import/commit/route.ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { safeFetch } from '@/lib/safe-fetch'
import { putObjectBuffer } from '@/lib/s3'

export const dynamic = 'force-dynamic'

interface CommitRow {
  socialAccountId: string
  content: string
  scheduledAt: string
  mediaUrl: string | null
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/gif':       'gif',
  'image/webp':      'webp',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

/**
 * Fetches and re-hosts one row's media URL to S3, mirroring the key pattern
 * app/api/upload/media-presign/route.ts uses for browser uploads. Returns
 * null on any failure -- a dead link at commit time (it may have looked fine
 * during the parse-time HEAD check) must degrade to "post without media",
 * not fail the whole row this late.
 */
async function rehostMedia(workspaceId: string, url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    const ext = EXT_BY_CONTENT_TYPE[contentType]
    if (!ext) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    const key = `media/${workspaceId}/${randomUUID()}.${ext}`
    await putObjectBuffer(key, buffer, contentType)

    const bucket = process.env.AWS_S3_BUCKET!
    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
  } catch {
    return null
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
      include: { workspace: { select: { clientAccessLevel: true } } },
    })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { rows } = (await req.json()) as { rows?: CommitRow[] }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows is required and must be non-empty' }, { status: 400 })
    }

    // Same approval-routing rule POST /api/posts already applies -- a bulk
    // import must not bypass client approval just because it arrived as a
    // batch instead of individual composer submissions.
    const finalStatus = access.workspace.clientAccessLevel === 'APPROVE' ? 'PENDING_APPROVAL' : 'SCHEDULED'

    // Media re-hosting runs before the transaction, not inside it -- an
    // external fetch can take seconds, and Prisma's interactive transactions
    // hold a DB connection open for their whole duration. Holding one open
    // per row while fetching external media would be a real connection-pool
    // risk on a 500-row import.
    const rehosted = await Promise.all(
      rows.map((row) => (row.mediaUrl ? rehostMedia(workspaceId, row.mediaUrl) : Promise.resolve(null)))
    )

    const posts = await prisma.$transaction(
      rows.map((row, i) =>
        prisma.post.create({
          data: {
            workspaceId,
            socialAccountId: row.socialAccountId,
            authorId: user.id,
            content: row.content,
            mediaUrls: rehosted[i] ? [rehosted[i]!] : [],
            status: finalStatus,
            scheduledAt: new Date(row.scheduledAt),
          },
        })
      )
    )

    return NextResponse.json({ created: posts.length, posts })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/workspaces/[id]/bulk-import/commit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd LYRA/lyra && npx vitest run "app/api/workspaces/[id]/bulk-import/commit/route.test.ts"`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add "app/api/workspaces/[id]/bulk-import/commit/"
git commit -m "feat: bulk import commit route"
```

---

### Task 5: Review screen, upload page, and calendar entry point

No component test file for this task, matching this codebase's existing convention — `content-calendar.tsx`, `post-preview-card.tsx`, and `post-detail-panel.tsx` have no render-level test files either; only their extracted pure-logic functions (e.g. `getNextStatuses`) are unit tested elsewhere. `content-calendar.test.ts` does not exist today and this task does not introduce a new pattern by skipping one here.

**Files:**
- Create: `components/lyra/calendar/bulk-import-review-table.tsx`
- Create: `app/(dashboard)/workspace/[workspaceId]/calendar/bulk-import/page.tsx`
- Modify: `app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx`

- [ ] **Step 1: Build the review table component**

```tsx
// components/lyra/calendar/bulk-import-review-table.tsx
'use client'

interface ImportRow {
  rowNumber: number
  status: 'ready' | 'warning' | 'error'
  reason?: string
  post?: {
    socialAccountId: string
    platform: string
    content: string
    scheduledAt: string
    mediaUrl: string | null
  }
}

interface BulkImportReviewTableProps {
  rows: ImportRow[]
  selected: Set<number>
  onToggle: (rowNumber: number) => void
}

export function BulkImportReviewTable({ rows, selected, onToggle }: BulkImportReviewTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-background-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-background-border text-left text-text-tertiary">
            <th className="p-2 w-8" />
            <th className="p-2">Date/Time</th>
            <th className="p-2">Platform</th>
            <th className="p-2">Caption</th>
            <th className="p-2">Media</th>
            <th className="p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowNumber} className="border-b border-background-border last:border-0">
              <td className="p-2">
                <input
                  type="checkbox"
                  disabled={row.status === 'error'}
                  checked={selected.has(row.rowNumber)}
                  onChange={() => onToggle(row.rowNumber)}
                  aria-label={`Include row ${row.rowNumber}`}
                />
              </td>
              <td className="p-2 font-mono text-xs">
                {row.post ? new Date(row.post.scheduledAt).toLocaleString() : '—'}
              </td>
              <td className="p-2">{row.post?.platform ?? '—'}</td>
              <td className="p-2 max-w-xs truncate">{row.post?.content ?? '—'}</td>
              <td className="p-2 text-xs text-text-tertiary">{row.post?.mediaUrl ? 'Attached' : 'None'}</td>
              <td className="p-2 text-xs">
                {row.status === 'ready' && <span className="text-status-success">Ready</span>}
                {row.status === 'warning' && <span className="text-status-warning">{row.reason}</span>}
                {row.status === 'error' && <span className="text-status-error">{row.reason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Build the upload + review page**

```tsx
// app/(dashboard)/workspace/[workspaceId]/calendar/bulk-import/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BulkImportReviewTable } from '@/components/lyra/calendar/bulk-import-review-table'

interface ImportRow {
  rowNumber: number
  status: 'ready' | 'warning' | 'error'
  reason?: string
  post?: {
    socialAccountId: string
    platform: string
    content: string
    scheduledAt: string
    mediaUrl: string | null
  }
}

export default function BulkImportPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)

  async function handleUpload(file: File) {
    setParsing(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch(`/api/workspaces/${workspaceId}/bulk-import/parse`, { method: 'POST', body: form })
      const data = (await res.json()) as { rows?: ImportRow[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to parse file')

      setRows(data.rows ?? [])
      setSelected(new Set((data.rows ?? []).filter((r) => r.status !== 'error').map((r) => r.rowNumber)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse file')
    } finally {
      setParsing(false)
    }
  }

  function toggleRow(rowNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  async function handleImport() {
    if (!rows) return
    const toImport = rows.filter((r) => selected.has(r.rowNumber) && r.post).map((r) => r.post!)
    if (toImport.length === 0) return

    setImporting(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/bulk-import/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: toImport }),
      })
      const data = (await res.json()) as { created?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')

      toast.success(`Imported ${data.created} post${data.created === 1 ? '' : 's'}`)
      router.push(`/workspace/${workspaceId}/calendar`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-4xl text-text-primary">Bulk import</h2>
        <p className="text-text-secondary text-sm mt-1">Download the template, fill it in, then upload it below.</p>
      </div>

      <div className="flex items-center gap-3">
        <a
          href={`/api/workspaces/${workspaceId}/bulk-import/template`}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary px-3 h-8 rounded-md transition-colors"
        >
          Download template
        </a>
        <input
          type="file"
          accept=".xlsx"
          disabled={parsing}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleUpload(file)
          }}
        />
      </div>

      {rows && (
        <>
          <p className="text-sm text-text-secondary">
            {rows.filter((r) => r.status === 'ready').length} ready,{' '}
            {rows.filter((r) => r.status === 'warning').length} with warnings,{' '}
            {rows.filter((r) => r.status === 'error').length} blocked.
          </p>
          <BulkImportReviewTable rows={rows} selected={selected} onToggle={toggleRow} />
          <Button onClick={handleImport} disabled={importing || selected.size === 0}>
            {importing ? 'Importing…' : `Import ${selected.size} post${selected.size === 1 ? '' : 's'}`}
          </Button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add the "Bulk import" entry point next to "New post"**

`app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` currently renders its action buttons like this (read the file first to confirm this hasn't changed since this plan was written):

```tsx
        <div className="flex items-center gap-2 shrink-0">
          <ScheduleGenerator
            workspaceId={workspaceId}
            hasBrandProfile={hasBrandProfile}
            connectedPlatforms={connectedPlatforms}
          />
          <Link
            href={`/workspace/${workspaceId}/compose`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-background-primary hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
          >
            <Plus size={13} />
            New post
          </Link>
        </div>
```

Add a "Bulk import" link before the "New post" `Link`, matching the secondary-button style already used elsewhere in this file's action row (`ScheduleGenerator`'s own trigger button uses this same `bg-background-tertiary` treatment):

```tsx
        <div className="flex items-center gap-2 shrink-0">
          <ScheduleGenerator
            workspaceId={workspaceId}
            hasBrandProfile={hasBrandProfile}
            connectedPlatforms={connectedPlatforms}
          />
          <Link
            href={`/workspace/${workspaceId}/calendar/bulk-import`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary px-3 h-8 rounded-md transition-colors"
          >
            Bulk import
          </Link>
          <Link
            href={`/workspace/${workspaceId}/compose`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-background-primary hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
          >
            <Plus size={13} />
            New post
          </Link>
        </div>
```

- [ ] **Step 4: Typecheck and lint**

Run: `cd LYRA/lyra && npx tsc --noEmit`
Expected: no output (clean)

Run: `cd LYRA/lyra && npx eslint components/lyra/calendar/bulk-import-review-table.tsx "app/(dashboard)/workspace/[workspaceId]/calendar/bulk-import/page.tsx" "app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx"`
Expected: no output (clean)

- [ ] **Step 5: Manual smoke test**

Run: `cd LYRA/lyra && npm run dev`, sign in, open a workspace's Calendar, confirm:
- "Bulk import" button appears next to "New post"
- Clicking it loads the upload page
- "Download template" produces a real `.xlsx` file with a working Platform dropdown scoped to that workspace's connected accounts
- Filling in a couple of rows (including one with a bad platform value bypassing the dropdown, one with a dead media URL, and one fully valid) and uploading shows the expected ready/warning/error split in the review table
- Clicking Import creates the expected posts, visible back on the calendar in the right status (SCHEDULED, or PENDING_APPROVAL if the workspace has client approval on)

- [ ] **Step 6: Run the full test suite**

Run: `cd LYRA/lyra && npx vitest run`
Expected: all tests pass, including every test from Tasks 1–4

- [ ] **Step 7: Commit**

```bash
git add components/lyra/calendar/bulk-import-review-table.tsx "app/(dashboard)/workspace/[workspaceId]/calendar/bulk-import/" "app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx"
git commit -m "feat: bulk import review screen and calendar entry point"
```

---

## Self-review notes

**Spec coverage** — every numbered section of the design spec maps to a task: §2 (template) → Task 1; §3 (parse/validate) → Tasks 2–3; §4 (review screen) → Task 5; §5 (commit) → Task 4; §6 (no schema changes) → confirmed, no task touches `prisma/schema.prisma`; §7 (files) → all listed files appear in exactly one task, no gaps.

**Deliberate deviation from the file list in the spec/dispatch prompt:** the "Bulk import" entry point is wired into `app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` (next to the existing "New post" link), not into `content-calendar.tsx`'s internal filter toolbar as originally assumed. Reading the actual current file showed `content-calendar.tsx`'s toolbar is the status-filter tabs (Draft/Scheduled/etc.), a different row from where page-level actions like "New post" already live — the new button belongs with its sibling action, not inside the filter row.
