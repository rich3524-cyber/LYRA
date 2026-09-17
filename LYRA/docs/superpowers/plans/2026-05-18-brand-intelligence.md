# Brand Intelligence Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the brand intelligence build with multi-page website scraping, use of existing published posts as social data, a shared S3 utility, and a brand guidelines upload flow so the built profile is actually informed by the workspace's content.

**Architecture:** The existing build route at `app/api/brand-intelligence/build/route.ts` already orchestrates scraping + Claude API call + DB upsert — it just uses an empty `socialPosts` array and only scrapes one page. We fix both: (1) query `Post` records from the DB for published content, (2) scrape homepage + /about + /services. We also add a guidelines upload flow: a new `lib/s3.ts` shared client, a presigned-URL endpoint for direct browser-to-S3 upload, a key-save endpoint, and a `GuidelinesUploader` UI component rendered on the existing brand page.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma (existing singleton), AWS S3 SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` — both already in package.json), Cheerio (already installed), react-dropzone (already installed), Tailwind CSS design tokens, Lucide React, sonner toasts

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lyra/services/brand-intelligence/scraper.ts` | Add `scrapeMultiplePages()` |
| Modify | `lyra/app/api/brand-intelligence/build/route.ts` | Use DB posts + multi-page scrape |
| Create | `lyra/lib/s3.ts` | Shared S3 client + presigned URL helper |
| Create | `lyra/app/api/brand-intelligence/guidelines/presigned/route.ts` | Returns presigned PUT URL for browser upload |
| Create | `lyra/app/api/brand-intelligence/guidelines/route.ts` | Saves S3 key to `BrandProfile.guidelineUrls` |
| Create | `lyra/components/lyra/brand/guidelines-uploader.tsx` | Dropzone UI: upload + list current guidelines |
| Modify | `lyra/app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` | Add GuidelinesUploader to the profile-ready section |

---

## Design System Reference

Always use these tokens — never hardcode hex values:

```
bg-background-primary    (#080808) — page background
bg-background-secondary  (#0f0f0f) — card/panel backgrounds
bg-background-tertiary   (#141414) — elevated surfaces
bg-background-hover      (#1a1a1a) — hover states
border-background-border (#222222) — subtle borders
border-background-border-mid (#333333) — mid-weight borders
text-primary   (#e2e2e2) — primary text
text-secondary (#888888) — secondary labels
text-tertiary  (#555555) — muted / placeholder
status-success / status-error / status-warning

font-sans  = DM Sans (all UI text, weights 300/400/500 ONLY — never 700)
font-mono  = Geist Mono (counts, metrics)

Icons: Lucide React only. strokeWidth={1.5} default.
Rounded: rounded-xl for cards, rounded-lg for inputs.
```

---

## Key Context

### Existing build route (`app/api/brand-intelligence/build/route.ts`)

The route already:
1. Verifies workspace access
2. Calls `scrapeWebsite(workspace.websiteUrl)` (one page only)
3. Calls `parseWorkspaceGuidelines(guidelineUrls)` from S3
4. Has a TODO comment: `// TODO: Fetch real social posts from connected platform APIs`
5. Calls `buildBrandProfile(websiteData, guidelinesText, socialPosts)` via Claude API
6. Upserts `BrandProfile` record

We change steps 2 and 4. Everything else stays the same.

### Existing scraper (`services/brand-intelligence/scraper.ts`)

Has `scrapeWebsite(url: string): Promise<ScrapedWebsite>`. We add `scrapeMultiplePages(baseUrl: string): Promise<ScrapedWebsite>` that calls `scrapeWebsite` for the home URL + up to 2 subpages and merges the results.

### BrandProfile schema

```prisma
model BrandProfile {
  guidelineUrls    String[]   // S3 keys for uploaded guidelines documents
  websiteData      Json?      // raw scrape output stored here
  ...
}
```

`guidelineUrls` is an array of S3 object keys (not full URLs). The `parseWorkspaceGuidelines()` function in `services/brand-intelligence/document-parser.ts` already handles fetching these from S3 — it strips the bucket URL prefix if needed.

### S3 upload flow (two-step)

1. Browser calls `POST /api/brand-intelligence/guidelines/presigned` → gets `{ uploadUrl, key }`
2. Browser does `PUT uploadUrl` with the file bytes directly (no server proxy needed)
3. Browser calls `POST /api/brand-intelligence/guidelines` with `{ workspaceId, key }` → key added to `BrandProfile.guidelineUrls`

The presigned URL expires in 5 minutes. S3 keys follow the pattern `guidelines/${workspaceId}/${timestamp}-${filename}`.

### Environment variables required (already present in .env)

```
AWS_REGION           ap-southeast-2
AWS_ACCESS_KEY_ID    ...
AWS_SECRET_ACCESS_KEY ...
AWS_S3_BUCKET        ...
```

---

### Task 1: Add `scrapeMultiplePages` to the scraper service

**Files:**
- Modify: `lyra/services/brand-intelligence/scraper.ts`

The existing `scrapeWebsite` function works well. We add a new exported function that calls it for multiple pages and merges the results. If a subpage returns a 404, `fetch` will still resolve (HTTP 200 for the 404 page) or the `scrapeWebsite` call may throw — we use `Promise.allSettled` so one failure doesn't abort the rest.

- [ ] **Step 1: Read the current file**

Read `lyra/services/brand-intelligence/scraper.ts` to see the exact current content.

- [ ] **Step 2: Add `scrapeMultiplePages` at the end of the file**

The existing `scrapeWebsite` export must remain unchanged. Append the new function:

```typescript
/**
 * Scrapes the homepage plus common subpages (/about, /services).
 * Individual page failures are silently skipped.
 * Body text from all pages is merged (capped at 8 000 chars total).
 */
export async function scrapeMultiplePages(baseUrl: string): Promise<ScrapedWebsite> {
  const origin = new URL(baseUrl).origin
  const pagesToTry = [
    baseUrl,
    `${origin}/about`,
    `${origin}/services`,
  ]

  const results = await Promise.allSettled(
    pagesToTry.map((url) => scrapeWebsite(url))
  )

  const successful = results
    .filter((r): r is PromiseFulfilledResult<ScrapedWebsite> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (successful.length === 0) {
    return { title: '', description: '', bodyText: '', headings: [], metaKeywords: [] }
  }

  return {
    title:        successful[0].title,
    description:  successful[0].description,
    bodyText:     successful.map((p) => p.bodyText).join('\n\n').slice(0, 8000),
    headings:     Array.from(new Set(successful.flatMap((p) => p.headings))).slice(0, 30),
    metaKeywords: Array.from(new Set(successful.flatMap((p) => p.metaKeywords))),
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/services/brand-intelligence/scraper.ts" && git commit -m "feat: add scrapeMultiplePages for richer brand website analysis"
```

---

### Task 2: Update build route — use DB posts + multi-page scraping

**Files:**
- Modify: `lyra/app/api/brand-intelligence/build/route.ts`

Two changes:
1. Replace `scrapeWebsite` import/call with `scrapeMultiplePages`
2. Replace the empty `socialPosts: string[] = []` with a Prisma query for published/scheduled posts in this workspace

- [ ] **Step 1: Read the current file**

Read `lyra/app/api/brand-intelligence/build/route.ts`.

- [ ] **Step 2: Write the complete updated file**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scrapeMultiplePages } from '@/services/brand-intelligence/scraper'
import { buildBrandProfile } from '@/services/brand-intelligence/profile-builder'
import { parseWorkspaceGuidelines } from '@/services/brand-intelligence/document-parser'
import { analyzeSocialPosts } from '@/services/brand-intelligence/social-analyzer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      include: { brandProfile: true, socialAccounts: { select: { platform: true, isActive: true } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Scrape website (homepage + /about + /services)
    let websiteData = { title: '', description: '', bodyText: '', headings: [] as string[], metaKeywords: [] as string[] }
    if (workspace.websiteUrl) {
      try {
        websiteData = await scrapeMultiplePages(workspace.websiteUrl)
      } catch {
        console.warn(`Failed to scrape ${workspace.websiteUrl}`)
      }
    }

    // Parse brand guidelines from S3 (if any uploaded)
    const guidelinesText = workspace.brandProfile?.guidelineUrls?.length
      ? await parseWorkspaceGuidelines(workspace.brandProfile.guidelineUrls)
      : ''

    // Use published/scheduled posts from DB as social content signal
    const recentPosts = await prisma.post.findMany({
      where: {
        workspaceId,
        status: { in: ['PUBLISHED', 'SCHEDULED', 'APPROVED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { content: true },
    })
    const socialPosts = recentPosts.map((p) => p.content)
    const insights    = analyzeSocialPosts(socialPosts)

    const profileData = await buildBrandProfile(websiteData, guidelinesText, socialPosts)

    await prisma.brandProfile.upsert({
      where:  { workspaceId },
      create: {
        workspaceId,
        voiceSummary:    profileData.voiceSummary,
        toneAttributes:  profileData.toneAttributes,
        contentThemes:   profileData.contentThemes,
        audienceProfile: profileData.audienceProfile,
        postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights })),
        websiteData:     JSON.parse(JSON.stringify(websiteData)),
        lastScrapedAt:   new Date(),
        lastUpdatedAt:   new Date(),
      },
      update: {
        voiceSummary:    profileData.voiceSummary,
        toneAttributes:  profileData.toneAttributes,
        contentThemes:   profileData.contentThemes,
        audienceProfile: profileData.audienceProfile,
        postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights })),
        websiteData:     JSON.parse(JSON.stringify(websiteData)),
        lastScrapedAt:   new Date(),
        lastUpdatedAt:   new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/build error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/app/api/brand-intelligence/build/route.ts" && git commit -m "feat: use multi-page scraping and DB posts in brand intelligence build"
```

---

### Task 3: Create shared S3 utility

**Files:**
- Create: `lyra/lib/s3.ts`

This creates the shared S3 client and a `getUploadPresignedUrl` helper used by the presigned URL endpoint. The `@aws-sdk/s3-request-presigner` package is already in the lock file via `@aws-sdk/client-s3`'s peer deps and is listed in package.json as part of the AWS SDK family.

- [ ] **Step 1: Check if `@aws-sdk/s3-request-presigner` is available**

```bash
cd lyra && node -e "require('@aws-sdk/s3-request-presigner'); console.log('ok')"
```

Expected output: `ok`

If it prints an error, install it:

```bash
cd lyra && npm install @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Create `lyra/lib/s3.ts`**

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-southeast-2',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.AWS_S3_BUCKET!

/** Returns a presigned PUT URL valid for 5 minutes. */
export async function getUploadPresignedUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(s3, command, { expiresIn: 300 })
}

/** Deletes an object from S3. */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
```

- [ ] **Step 3: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/lib/s3.ts" && git commit -m "feat: add shared S3 utility with presigned URL helper"
```

---

### Task 4: Create presigned URL endpoint and key-save endpoint

**Files:**
- Create: `lyra/app/api/brand-intelligence/guidelines/presigned/route.ts`
- Create: `lyra/app/api/brand-intelligence/guidelines/route.ts`

**Presigned URL endpoint:** Takes `{ workspaceId, filename, contentType }`, verifies workspace access, generates an S3 key, returns `{ uploadUrl, key }`.

**Key-save endpoint:** Takes `{ workspaceId, key }`, appends the key to `BrandProfile.guidelineUrls` (creating the profile row if it doesn't exist yet).

- [ ] **Step 1: Create the presigned URL route**

Write `lyra/app/api/brand-intelligence/guidelines/presigned/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUploadPresignedUrl } from '@/lib/s3'

const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, filename, contentType } = await req.json()

    if (!workspaceId || !filename || !contentType) {
      return NextResponse.json({ error: 'workspaceId, filename and contentType required' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'File type not allowed. Use PDF, TXT, or DOCX.' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const key          = `guidelines/${workspaceId}/${Date.now()}-${safeFilename}`
    const uploadUrl    = await getUploadPresignedUrl(key, contentType)

    return NextResponse.json({ uploadUrl, key })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/guidelines/presigned error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create the key-save route**

Write `lyra/app/api/brand-intelligence/guidelines/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/s3'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, key } = await req.json()

    if (!workspaceId || !key) {
      return NextResponse.json({ error: 'workspaceId and key required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Upsert the BrandProfile row and append the key
    const existing = await prisma.brandProfile.findUnique({ where: { workspaceId } })
    const currentUrls = existing?.guidelineUrls ?? []

    await prisma.brandProfile.upsert({
      where:  { workspaceId },
      create: { workspaceId, guidelineUrls: [key] },
      update: { guidelineUrls: [...currentUrls, key] },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/guidelines error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, key } = await req.json()

    if (!workspaceId || !key) {
      return NextResponse.json({ error: 'workspaceId and key required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Remove from S3
    await deleteObject(key)

    // Remove from BrandProfile.guidelineUrls
    const profile = await prisma.brandProfile.findUnique({ where: { workspaceId } })
    if (profile) {
      await prisma.brandProfile.update({
        where: { workspaceId },
        data:  { guidelineUrls: profile.guidelineUrls.filter((u) => u !== key) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/brand-intelligence/guidelines error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/app/api/brand-intelligence/guidelines/presigned/route.ts" "LYRA/lyra/app/api/brand-intelligence/guidelines/route.ts" && git commit -m "feat: add brand guidelines presigned upload and key-save API endpoints"
```

---

### Task 5: Create GuidelinesUploader component

**Files:**
- Create: `lyra/components/lyra/brand/guidelines-uploader.tsx`

This is a client component using `react-dropzone`. It:
1. Shows existing guidelines as a list (filename extracted from the S3 key, which looks like `guidelines/workspaceId/timestamp-filename.pdf`)
2. Shows a dropzone for adding new files
3. On drop: POST `/presigned` → PUT to S3 → POST `/save` → calls `onUpdated()` to trigger a page refresh
4. Has a delete button per existing file that calls DELETE `/api/brand-intelligence/guidelines`

Accepted file types: PDF, TXT, DOCX (max 5 MB each).

- [ ] **Step 1: Create the component**

Write `lyra/components/lyra/brand/guidelines-uploader.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Trash2, FileText, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  workspaceId: string
  guidelineUrls: string[]  // S3 keys, e.g. "guidelines/wid/1234-filename.pdf"
}

function keyToFilename(key: string): string {
  const parts = key.split('/')
  const last  = parts[parts.length - 1] ?? key
  // Strip the timestamp prefix: "1716000000000-my-doc.pdf" → "my-doc.pdf"
  return last.replace(/^\d+-/, '')
}

export function GuidelinesUploader({ workspaceId, guidelineUrls }: Props) {
  const router  = useRouter()
  const [uploading, setUploading]   = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    const file = acceptedFiles[0]

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5 MB')
      return
    }

    setUploadError(null)
    setUploading(true)

    try {
      // Step 1: Get presigned URL
      const presignRes = await fetch('/api/brand-intelligence/guidelines/presigned', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Failed to get upload URL')
      }
      const { uploadUrl, key } = await presignRes.json() as { uploadUrl: string; key: string }

      // Step 2: Upload directly to S3
      const s3Res = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })
      if (!s3Res.ok) throw new Error('Upload to storage failed')

      // Step 3: Save key to DB
      const saveRes = await fetch('/api/brand-intelligence/guidelines', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, key }),
      })
      if (!saveRes.ok) throw new Error('Failed to save file reference')

      toast.success(`${file.name} uploaded`)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }, [workspaceId, router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf':                                                                    ['.pdf'],
      'text/plain':                                                                          ['.txt'],
      'text/markdown':                                                                       ['.md'],
      'application/msword':                                                                  ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':            ['.docx'],
    },
    maxFiles:  1,
    disabled:  uploading,
  })

  async function handleDelete(key: string) {
    setDeleting(key)
    try {
      const res = await fetch('/api/brand-intelligence/guidelines', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, key }),
      })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('File removed')
      router.refresh()
    } catch {
      toast.error('Failed to remove file')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Existing files */}
      {guidelineUrls.length > 0 && (
        <ul className="space-y-1">
          {guidelineUrls.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-background-tertiary border border-background-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={12} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
                <span className="font-sans text-xs text-text-secondary truncate">
                  {keyToFilename(key)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(key)}
                disabled={deleting === key}
                aria-label="Remove file"
                className="text-text-tertiary hover:text-status-error transition-colors shrink-0 disabled:opacity-40"
              >
                {deleting === key
                  ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                  : <Trash2 size={12} strokeWidth={1.5} />
                }
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'border border-dashed border-background-border rounded-xl p-6 text-center cursor-pointer transition-colors',
          isDragActive && 'border-accent-platinum bg-background-hover',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <Loader2 size={16} strokeWidth={1.5} className="text-text-tertiary animate-spin" />
          ) : (
            <Upload size={16} strokeWidth={1.5} className="text-text-tertiary" />
          )}
          <p className="font-sans text-xs text-text-tertiary">
            {uploading
              ? 'Uploading…'
              : isDragActive
              ? 'Drop file here'
              : 'Drop a PDF, TXT, or DOCX — or click to browse'}
          </p>
          <p className="font-sans text-[10px] text-text-tertiary">Max 5 MB</p>
        </div>
      </div>

      {uploadError && (
        <p className="font-sans text-xs text-status-error">{uploadError}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/components/lyra/brand/guidelines-uploader.tsx" && git commit -m "feat: add GuidelinesUploader component for brand guidelines upload"
```

---

### Task 6: Wire GuidelinesUploader into the brand page

**Files:**
- Modify: `lyra/app/(dashboard)/workspace/[workspaceId]/brand/page.tsx`

The brand page already has three states: setup gate (missing website/social), ready-but-no-profile, and profile-exists. The guidelines uploader should appear in the **profile-exists** section (and also in the ready-but-no-profile section, so users can upload docs before building). It is a server component page that passes `guidelineUrls` from the DB as a prop to the client component.

The `brandProfile?.guidelineUrls` field is available already since the page queries `brandProfile: true` in its Prisma select.

- [ ] **Step 1: Read the current brand page**

Read `lyra/app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` to confirm the exact current content.

- [ ] **Step 2: Add GuidelinesUploader import and render it**

The page currently imports from `@/components/lyra/brand/brand-build-button`. Add the GuidelinesUploader import and insert it into both the "profile-exists" section and the "ready-but-no-profile" section.

After the existing imports at the top, add:
```typescript
import { GuidelinesUploader } from '@/components/lyra/brand/guidelines-uploader'
```

In the "ready but no profile built yet" block (after the descriptive text, before the closing `</div>`):
```tsx
<GuidelinesUploader
  workspaceId={workspaceId}
  guidelineUrls={profile?.guidelineUrls ?? []}
/>
```

In the "profile exists" block, add a new `<section>` after the "Posting Guidelines" section (or at the end of the `space-y-6` div):
```tsx
{/* Brand guidelines documents */}
<section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
  <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
    Brand guidelines
  </p>
  <p className="font-sans text-xs text-text-tertiary">
    Upload PDF or DOCX brand guidelines. LYRA uses these documents when building your brand profile.
  </p>
  <GuidelinesUploader
    workspaceId={workspaceId}
    guidelineUrls={profile.guidelineUrls}
  />
</section>
```

The full updated file content for the brand page — write this to `lyra/app/(dashboard)/workspace/[workspaceId]/brand/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { Zap, Globe, Share2, Lock } from 'lucide-react'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BrandBuildButton } from '@/components/lyra/brand/brand-build-button'
import { GuidelinesUploader } from '@/components/lyra/brand/guidelines-uploader'

interface Props {
  params: Promise<{ workspaceId: string }>
}

interface AudienceProfile {
  demographics?: string
  interests?: string[]
  painPoints?: string[]
  languageLevel?: string
}

interface PostingPatterns {
  guidelines?: string
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default async function BrandPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      brandProfile: true,
      _count: { select: { socialAccounts: { where: { isActive: true } } } },
    },
  })
  if (!workspace) notFound()

  const hasWebsite  = !!workspace.websiteUrl
  const hasSocial   = (workspace._count?.socialAccounts ?? 0) > 0
  const brandReady  = hasWebsite && hasSocial
  const profile     = workspace.brandProfile
  const audience    = profile?.audienceProfile as AudienceProfile | null
  const patterns    = profile?.postingPatterns as PostingPatterns | null

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="font-display text-4xl text-text-primary">Brand Intelligence</h1>
          <p className="font-sans text-sm text-text-secondary">
            {profile?.lastUpdatedAt
              ? `Updated ${timeAgo(profile.lastUpdatedAt)} · ${workspace.name}`
              : workspace.name}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <BrandBuildButton workspaceId={workspaceId} hasProfile={!!profile} />
        </div>
      </div>

      {!brandReady ? (
        /* Setup gate */
        <div className="py-16 space-y-6">
          <div className="space-y-3">
            <Lock size={24} strokeWidth={1.5} className="text-text-tertiary" />
            <div className="space-y-1">
              <p className="font-sans text-sm text-text-secondary">Brand AI is not yet available.</p>
              <p className="font-sans text-sm text-text-tertiary max-w-sm leading-relaxed">
                Complete the steps below in Settings, then return here to build your brand profile.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${hasWebsite ? 'border-status-success bg-status-success' : 'border-background-border-mid'}`}>
                {hasWebsite && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#080808" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <Globe size={14} strokeWidth={1.5} className="text-text-tertiary" />
              <span className="font-sans text-sm text-text-tertiary">Website URL added</span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${hasSocial ? 'border-status-success bg-status-success' : 'border-background-border-mid'}`}>
                {hasSocial && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#080808" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <Share2 size={14} strokeWidth={1.5} className="text-text-tertiary" />
              <span className="font-sans text-sm text-text-tertiary">At least one social account connected</span>
            </div>
          </div>
          <Link
            href={`/workspace/${workspaceId}/settings`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            Go to Settings
          </Link>
        </div>
      ) : !profile ? (
        /* Ready but no profile built yet */
        <div className="py-8 space-y-6">
          <div className="space-y-3">
            <Zap size={24} strokeWidth={1.5} className="text-text-tertiary" />
            <div className="space-y-1">
              <p className="font-sans text-sm text-text-secondary">No brand profile built yet.</p>
              <p className="font-sans text-sm text-text-tertiary max-w-sm leading-relaxed">
                LYRA will scrape {workspace.websiteUrl} and analyse your connected social accounts
                to build your brand voice profile. The more accounts connected, the sharper the result.
              </p>
            </div>
          </div>

          {/* Guidelines upload available before first build */}
          <div className="space-y-2">
            <p className="font-sans text-xs text-text-tertiary">
              Optionally upload brand guidelines before building your profile.
            </p>
            <GuidelinesUploader workspaceId={workspaceId} guidelineUrls={[]} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Voice Summary */}
          <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Voice Summary
            </p>
            <p className="font-sans text-sm text-text-primary leading-relaxed">
              {profile.voiceSummary ?? '—'}
            </p>
          </section>

          {/* Tone + Themes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Tone Attributes
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.toneAttributes.length > 0
                  ? profile.toneAttributes.map((attr) => (
                      <span
                        key={attr}
                        className="px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                      >
                        {attr}
                      </span>
                    ))
                  : <p className="font-sans text-xs text-text-tertiary">None identified.</p>
                }
              </div>
            </section>

            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Content Themes
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.contentThemes.length > 0
                  ? profile.contentThemes.map((theme) => (
                      <span
                        key={theme}
                        className="px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                      >
                        {theme}
                      </span>
                    ))
                  : <p className="font-sans text-xs text-text-tertiary">None identified.</p>
                }
              </div>
            </section>
          </div>

          {/* Audience */}
          {audience && (
            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Audience Profile
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {audience.demographics && (
                  <div className="space-y-1">
                    <p className="font-sans text-xs text-text-tertiary">Demographics</p>
                    <p className="font-sans text-sm text-text-primary">{audience.demographics}</p>
                  </div>
                )}
                {audience.languageLevel && (
                  <div className="space-y-1">
                    <p className="font-sans text-xs text-text-tertiary">Language level</p>
                    <p className="font-sans text-sm text-text-primary capitalize">{audience.languageLevel}</p>
                  </div>
                )}
              </div>
              {Array.isArray(audience.interests) && audience.interests.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-text-tertiary">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {audience.interests.map((item) => (
                      <span
                        key={item}
                        className="px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(audience.painPoints) && audience.painPoints.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-text-tertiary">Pain points</p>
                  <ul className="space-y-1">
                    {audience.painPoints.map((point) => (
                      <li key={point} className="font-sans text-sm text-text-primary flex items-start gap-2">
                        <span className="text-text-tertiary mt-0.5 shrink-0">–</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Posting Guidelines */}
          {patterns?.guidelines && (
            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Posting Guidelines
              </p>
              <p className="font-sans text-sm text-text-primary leading-relaxed whitespace-pre-line">
                {patterns.guidelines}
              </p>
            </section>
          )}

          {/* Brand guidelines documents */}
          <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Brand guidelines
            </p>
            <p className="font-sans text-xs text-text-tertiary">
              Upload PDF or DOCX brand guidelines. LYRA uses these documents when building your brand profile.
            </p>
            <GuidelinesUploader
              workspaceId={workspaceId}
              guidelineUrls={profile.guidelineUrls}
            />
          </section>

          {/* Metadata */}
          <div className="flex items-center gap-6 pt-2">
            {profile.lastScrapedAt && (
              <div className="space-y-0.5">
                <p className="font-sans text-[11px] text-text-tertiary uppercase tracking-[0.1em]">Website scraped</p>
                <p className="font-mono text-xs text-text-secondary">{timeAgo(profile.lastScrapedAt)}</p>
              </div>
            )}
            {profile.lastUpdatedAt && (
              <div className="space-y-0.5">
                <p className="font-sans text-[11px] text-text-tertiary uppercase tracking-[0.1em]">Profile built</p>
                <p className="font-mono text-xs text-text-secondary">{timeAgo(profile.lastUpdatedAt)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Lint check**

```bash
cd lyra && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/app/(dashboard)/workspace/[workspaceId]/brand/page.tsx" && git commit -m "feat: add brand guidelines upload section to brand intelligence page"
```

---

## Self-Review Checklist

- [x] `scrapeMultiplePages` is a new export — existing `scrapeWebsite` export is unchanged (no breaking changes)
- [x] Build route imports `scrapeMultiplePages` replacing the old `scrapeWebsite` call
- [x] DB post query uses `{ in: ['PUBLISHED', 'SCHEDULED', 'APPROVED'] }` — all user-written content, not drafts
- [x] `lib/s3.ts` exports `s3`, `getUploadPresignedUrl`, `deleteObject` — reusable by other services
- [x] Presigned route sanitizes filename before using it in the S3 key
- [x] `ALLOWED_TYPES` check in presigned route prevents arbitrary file uploads
- [x] Key-save route uses `upsert` so it works whether a BrandProfile row exists or not
- [x] Delete route removes from both S3 and `guidelineUrls` array
- [x] GuidelinesUploader calls `router.refresh()` after upload/delete so the server component re-reads DB state
- [x] No hardcoded hex values in GuidelinesUploader — all Tailwind tokens
- [x] Lucide icons at strokeWidth={1.5}
- [x] Brand page updated in both "ready-but-no-profile" and "profile-exists" sections
- [x] `guidelineUrls` is passed from server component to GuidelinesUploader — no client-side fetch needed for initial list
