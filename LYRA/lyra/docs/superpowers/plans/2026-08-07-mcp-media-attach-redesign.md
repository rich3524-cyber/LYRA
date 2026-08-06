# Media Attach Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chunked S3 multipart upload feature (which cannot work — see the design spec) with a single synchronous source_url-based media attach flow across the LYRA main app and MCP gateway.

**Architecture:** One new gateway tool `attach_media(source_url, workspace_id?)` calls one new backend route `POST /api/upload/from-url`, which server-side-fetches the URL (SSRF-safe via the existing `lib/safe-fetch.ts`) and uploads the bytes directly to S3 via the existing `putObjectBuffer`, returning the public URL in one round trip. All previously-built chunked-multipart infrastructure (3 gateway tools, 3 backend routes, Redis session state, 4 S3 multipart functions, `putLyraApi`) is removed, not deprecated.

**Tech Stack:** Next.js API routes (main app, Netlify Functions), TypeScript MCP gateway (Railway), `@aws-sdk/client-s3`, existing `lib/safe-fetch.ts` SSRF-safe fetch, zod, vitest.

---

## Task 1: Remove backend chunked-multipart infrastructure (main app)

**Files:**
- Delete: `LYRA/lyra/lib/upload-session.ts`
- Delete: `LYRA/lyra/lib/upload-session.test.ts`
- Delete: `LYRA/lyra/app/api/upload/multipart/start/route.ts`
- Delete: `LYRA/lyra/app/api/upload/multipart/start/route.test.ts`
- Delete: `LYRA/lyra/app/api/upload/multipart/part/route.ts`
- Delete: `LYRA/lyra/app/api/upload/multipart/part/route.test.ts`
- Delete: `LYRA/lyra/app/api/upload/multipart/complete/route.ts`
- Delete: `LYRA/lyra/app/api/upload/multipart/complete/route.test.ts`
- Delete: `LYRA/lyra/lib/s3.test.ts` (its only content is the `describe('multipart upload functions', ...)` block — the whole file exists solely to test the 4 functions being removed below)
- Modify: `LYRA/lyra/lib/s3.ts`

- [ ] **Step 1: Delete the 8 files above**

```bash
cd LYRA/lyra
rm lib/upload-session.ts lib/upload-session.test.ts
rm -r app/api/upload/multipart
rm lib/s3.test.ts
```

- [ ] **Step 2: Edit `lib/s3.ts` — remove the 4 multipart functions and their now-unused imports**

The current file's import block is:

```typescript
import {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
```

Replace it with:

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
```

Then delete everything from the `createMultipartUpload` function through the end of the file (the `abortMultipartUpload` function) — i.e. delete this entire block, which currently follows `putObjectBuffer`:

```typescript
/** Opens a real S3 multipart upload session. Returns the real S3 UploadId. */
export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }))
  if (!res.UploadId) throw new Error('S3 did not return an UploadId')
  return res.UploadId
}

/** Uploads one part of a multipart upload. partNumber is 1-indexed, per S3's convention. Returns the part's ETag. */
export async function uploadPart(key: string, s3UploadId: string, partNumber: number, body: Buffer): Promise<string> {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw new Error(`Invalid S3 part number: ${partNumber} (must be an integer 1-10000)`)
  }
  const res = await s3.send(new UploadPartCommand({
    Bucket: BUCKET, Key: key, UploadId: s3UploadId, PartNumber: partNumber, Body: body,
  }))
  if (!res.ETag) throw new Error('S3 did not return an ETag for the uploaded part')
  return res.ETag
}

/** Finalizes a multipart upload. parts must be sorted by partNumber ascending -- S3 rejects an out-of-order list. */
export async function completeMultipartUpload(
  key: string,
  s3UploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
): Promise<void> {
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: s3UploadId,
    MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
  }))
}

/** Aborts a multipart upload, discarding any parts already uploaded. Used when finalizing the upload (CompleteMultipartUpload) itself fails. */
// Not yet called -- wired into the /api/upload/multipart/complete route's
// error-handling path in a later task, so a failed completion cleans up
// immediately rather than waiting on the S3 bucket's lifecycle rule.
export async function abortMultipartUpload(key: string, s3UploadId: string): Promise<void> {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: s3UploadId }))
}
```

The resulting file should end with `putObjectBuffer` (keep `getUploadPresignedUrl`, `deleteObject`, `headObjectLastModified`, `getObjectBuffer`, `putObjectBuffer` exactly as they are — all still used elsewhere in the codebase and by Task 3 below).

- [ ] **Step 3: Run the full main-app test suite and typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: every remaining test passes (no test anywhere else in the codebase references `lib/upload-session`, the 3 multipart routes, or the 4 removed `lib/s3.ts` functions — if typecheck or a test fails referencing one of these, find and remove that reference too before proceeding). Full suite was at 258 passing before this task; expect it to drop by exactly the tests deleted in Step 1 (9 in `s3.test.ts`, plus whatever `upload-session.test.ts` and the 3 route test files contained) with zero failures among what remains.

- [ ] **Step 4: Commit**

```bash
git add -A -- lib/upload-session.ts lib/upload-session.test.ts app/api/upload/multipart lib/s3.test.ts lib/s3.ts
git commit -m "refactor: remove chunked multipart upload infrastructure (main app)"
```

(The `rm -r` in Step 1 stages deletions as part of `git add -A` on that path scope; if `git status` shows anything else touched, stop and investigate before committing — this task should only remove the 8 files above and edit `lib/s3.ts`.)

---

## Task 2: Remove gateway chunked-multipart tools and putLyraApi (gateway)

**Files:**
- Delete: `LYRA/lyra-mcp/src/tools/start-media-upload.ts`
- Delete: `LYRA/lyra-mcp/src/tools/start-media-upload.test.ts`
- Delete: `LYRA/lyra-mcp/src/tools/upload-media-chunk.ts`
- Delete: `LYRA/lyra-mcp/src/tools/upload-media-chunk.test.ts`
- Delete: `LYRA/lyra-mcp/src/tools/complete-media-upload.ts`
- Delete: `LYRA/lyra-mcp/src/tools/complete-media-upload.test.ts`
- Modify: `LYRA/lyra-mcp/src/lyra-api-client.ts`
- Modify: `LYRA/lyra-mcp/src/lyra-api-client.test.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.test.ts`

**Read the current `mcp-server.ts` and `mcp-server.test.ts` in full first** — confirm the exact current line ranges before editing (this session has touched both files repeatedly; line numbers cited below were correct as of this plan's writing but may have drifted).

- [ ] **Step 1: Delete the 6 gateway tool files**

```bash
cd LYRA/lyra-mcp
rm src/tools/start-media-upload.ts src/tools/start-media-upload.test.ts
rm src/tools/upload-media-chunk.ts src/tools/upload-media-chunk.test.ts
rm src/tools/complete-media-upload.ts src/tools/complete-media-upload.test.ts
```

- [ ] **Step 2: Remove `putLyraApi` from `src/lyra-api-client.ts`**

Delete this entire block (currently between `postLyraApi` and `deleteLyraApi`):

```typescript
// PUT-capable sibling to postLyraApi, same structure, same error normalization.
// Currently only used by upload_media_chunk (the /api/upload/multipart/part route).
export async function putLyraApi<T = unknown>(
  path: string,
  bearerToken: string,
  body: unknown
): Promise<T> {
  const baseUrl = process.env.LYRA_API_BASE_URL
  const url = new URL(path, baseUrl)

  let res: Response
  let responseBody: unknown
  try {
    res = await fetch(url.toString(), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    responseBody = await res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new LyraApiTimeoutError(err)
    }
    throw new LyraApiNetworkError(err)
  }

  if (!res.ok) {
    throw new LyraApiError(res.status, responseBody)
  }
  return responseBody as T
}
```

- [ ] **Step 3: Remove the `putLyraApi` tests from `src/lyra-api-client.test.ts`**

Delete the entire `describe('putLyraApi', () => { ... })` block (it sits between the `describe('postLyraApi', ...)` and `describe('deleteLyraApi', ...)` blocks). Do not touch the merged import line at the top of the file that lists `callLyraApi, postLyraApi, putLyraApi, deleteLyraApi, ...` — just remove `putLyraApi` from that import list, keeping every other named import exactly as-is.

- [ ] **Step 4: Edit `src/mcp-server.ts` — remove the 3 tool imports and registry entries**

Remove these 3 import lines:

```typescript
import { startMediaUpload } from './tools/start-media-upload'
import { uploadMediaChunk } from './tools/upload-media-chunk'
import { completeMediaUpload } from './tools/complete-media-upload'
```

Remove these 3 `TOOL_REGISTRY` entries in full:

```typescript
  start_media_upload: {
    description: 'Start uploading an image or video to attach to a post. Returns an uploadId and chunkSizeBytes -- call upload_media_chunk repeatedly with base64-encoded chunks of that size, then complete_media_upload to get the final URL. Use the same protocol for images and video; a small image just completes in a single chunk.',
    inputSchema: z.object({
      workspace_id: z.string().optional(),
      filename: z.string(),
      contentType: z.string(),
      totalSizeBytes: z.number().int().positive(),
    }),
    handler: startMediaUpload,
  },
  upload_media_chunk: {
    description: 'Upload one chunk of a file previously started with start_media_upload. Call once per chunk of chunkSizeBytes (the last chunk may be smaller). Chunks may be sent in any order.',
    inputSchema: z.object({
      uploadId: z.string(),
      chunkIndex: z.number().int().nonnegative(),
      data: z.string(),
    }),
    handler: uploadMediaChunk,
  },
  complete_media_upload: {
    description: "Finish an upload once all chunks from upload_media_chunk have been sent. Returns the real URL -- pass it into draft_post or schedule_post's media_urls to attach it to a post.",
    inputSchema: z.object({ uploadId: z.string() }),
    handler: completeMediaUpload,
  },
```

(Leave `draft_post`/`schedule_post`'s `media_urls`-related description text as-is for now — Task 5 updates it to reference the new `attach_media` tool once that tool exists. Leaving a stale forward-reference for one task's duration is fine; it's not user-visible until this whole plan is deployed.)

Change the `NO_WORKSPACE_RESOLUTION_TOOLS` constant from:

```typescript
const NO_WORKSPACE_RESOLUTION_TOOLS = ['list_workspaces', 'upload_media_chunk', 'complete_media_upload']
```

to:

```typescript
const NO_WORKSPACE_RESOLUTION_TOOLS = ['list_workspaces']
```

And update the comment directly above it from:

```typescript
// Tools with no workspace_id concept in their inputSchema at all: either no
// workspace scoping (list_workspaces), or workspace context is already
// carried server-side by an in-flight upload session (upload_media_chunk,
// complete_media_upload). Resolving workspace_id for these would be a
// wasted resolveWorkspaceId() round-trip (a real HTTP call) with no effect
// on params the handler actually reads -- notably a wasted call on every
// single chunk of upload_media_chunk's hot per-chunk path.
```

to:

```typescript
// Tools with no workspace_id concept in their inputSchema at all -- currently
// just list_workspaces, which has no workspace scoping. Resolving
// workspace_id for a tool like this would be a wasted resolveWorkspaceId()
// round-trip (a real HTTP call) with no effect on params the handler
// actually reads.
```

- [ ] **Step 5: Edit `src/mcp-server.test.ts` — update the tool-count test and remove the dedicated exclusion test**

In the `'registers exactly the 15 core tools'` test, remove `'complete_media_upload'`, `'start_media_upload'`, and `'upload_media_chunk'` from the sorted array, and rename the test to `'registers exactly the 12 core tools'` (12 = 15 − 3; Task 5 brings this back up to 13 once `attach_media` is added). The array becomes:

```typescript
  it('registers exactly the 12 core tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'call_capability',
      'draft_post',
      'get_analytics',
      'get_brand_profile',
      'get_workspace_overview',
      'list_inbox_items',
      'list_scheduled_posts',
      'list_trends',
      'list_workspaces',
      'respond_to_item',
      'schedule_post',
      'search_capabilities',
    ])
  })
```

Delete the entire `it.each(['upload_media_chunk', 'complete_media_upload'])(...)` test block (both tools it tested no longer exist). Leave the `list_workspaces` exclusion test (`'does not resolve, rate-limit, or audit at the workspace level for list_workspaces ...'`) untouched — it's unrelated to this removal.

- [ ] **Step 6: Run the full gateway test suite and typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: every remaining test passes, zero failures. Full suite was at 197 passing before this task; expect it to drop by exactly the tests deleted/removed in Steps 1, 3, and 5, with zero failures among what remains.

- [ ] **Step 7: Commit**

```bash
git add -A -- src/tools/start-media-upload.ts src/tools/start-media-upload.test.ts \
  src/tools/upload-media-chunk.ts src/tools/upload-media-chunk.test.ts \
  src/tools/complete-media-upload.ts src/tools/complete-media-upload.test.ts \
  src/lyra-api-client.ts src/lyra-api-client.test.ts \
  src/mcp-server.ts src/mcp-server.test.ts
git commit -m "refactor: remove chunked multipart upload tools and putLyraApi (gateway)"
```

---

## Task 3: `POST /api/upload/from-url` route (main app)

**Files:**
- Create: `LYRA/lyra/app/api/upload/from-url/route.ts`
- Test: `LYRA/lyra/app/api/upload/from-url/route.test.ts`

**Read `LYRA/lyra/lib/safe-fetch.ts` and `LYRA/lyra/lib/s3.ts` in full first** (both already read for this plan — `safeFetch(rawUrl, init?, maxRedirects?): Promise<Response>` throws on an unsafe/invalid URL; `putObjectBuffer(key: string, body: Buffer, contentType: string): Promise<void>` already exists and needs no changes) — confirm their real current exports still match before writing code, since both may have changed since this plan was written.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/app/api/upload/from-url/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspaceAccess: { findFirst: vi.fn() } } }))
vi.mock('@/lib/s3', () => ({ putObjectBuffer: vi.fn() }))
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))
vi.mock('@/lib/authz', () => ({ canWrite: (role: string) => role !== 'CLIENT_VIEW' }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { putObjectBuffer } from '@/lib/s3'
import { safeFetch } from '@/lib/safe-fetch'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/upload/from-url', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function fakeFetchResponse(opts: { ok?: boolean; status?: number; contentType?: string; contentLength?: string; body?: Uint8Array }) {
  const bytes = opts.body ?? new Uint8Array([1, 2, 3, 4])
  const headers = new Map<string, string>()
  if (opts.contentType !== undefined) headers.set('content-type', opts.contentType)
  if (opts.contentLength !== undefined) headers.set('content-length', opts.contentLength)
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response
}

describe('POST /api/upload/from-url', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET', 'lyra-media-test')
    vi.stubEnv('S3_REGION', 'ap-southeast-2')
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(putObjectBuffer).mockResolvedValue(undefined)
  })

  it('fetches sourceUrl and uploads the bytes to S3, returning the public URL', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ contentType: 'image/jpeg', contentLength: '4' }))

    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toMatch(/^https:\/\/lyra-media-test\.s3\.ap-southeast-2\.amazonaws\.com\/media\/ws-1\/.+\.jpg$/)
    expect(safeFetch).toHaveBeenCalledWith('https://example.com/photo.jpg', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(putObjectBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^media\/ws-1\/.+\.jpg$/),
      expect.any(Buffer),
      'image/jpeg'
    )
  })

  it('rejects an unsupported content type without uploading anything', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ contentType: 'application/x-msdownload' }))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/malware.exe' }))
    expect(res.status).toBe(415)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('rejects a prototype-pollution content type ("constructor") instead of resolving Object.prototype members', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ contentType: 'constructor' }))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/evil' }))
    expect(res.status).toBe(415)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('rejects when Content-Length declares a size over the video cap, without reading the body', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      fakeFetchResponse({ contentType: 'video/mp4', contentLength: String(26 * 1024 * 1024) })
    )
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/video.mp4' }))
    expect(res.status).toBe(413)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('rejects when the actual downloaded body exceeds the cap even if Content-Length under-reported it', async () => {
    const oversized = new Uint8Array(26 * 1024 * 1024)
    vi.mocked(safeFetch).mockResolvedValue(
      fakeFetchResponse({ contentType: 'video/mp4', contentLength: '10', body: oversized })
    )
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/video.mp4' }))
    expect(res.status).toBe(413)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('returns 502 when the fetch responds with a non-ok status', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ ok: false, status: 404 }))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/missing.jpg' }))
    expect(res.status).toBe(502)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('returns 400 when sourceUrl fails the SSRF safety check', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('URL resolves to a private/reserved address: 169.254.169.254'))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://metadata.example.com/evil' }))
    expect(res.status).toBe(400)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('returns 504 when the fetch times out', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new DOMException('aborted', 'TimeoutError'))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/slow.jpg' }))
    expect(res.status).toBe(504)
  })

  it('requires workspaceId', async () => {
    const res = await POST(req({ sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(400)
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('requires sourceUrl', async () => {
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(400)
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks write access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(403)
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra
npx vitest run app/api/upload/from-url/route.test.ts
```

Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/app/api/upload/from-url/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { putObjectBuffer } from '@/lib/s3'
import { safeFetch } from '@/lib/safe-fetch'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50 MB, matches the old multipart start route's image limit
// 25 MB, not 200MB -- fetch + S3 PUT must both complete inside a single
// synchronous Netlify Function invocation (~10-26s), unlike the removed
// multipart route's chunked-across-many-requests approach. See the design
// spec (docs/superpowers/specs/2026-08-07-mcp-media-attach-redesign-design.md)
// for the full rationale.
const MAX_VIDEO_SIZE = 25 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/gif':       'gif',
  'image/webp':      'webp',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`upload-from-url:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, sourceUrl } = await req.json() as { workspaceId?: string; sourceUrl?: string }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    if (!sourceUrl) {
      return NextResponse.json({ error: 'sourceUrl required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let res: Response
    try {
      res = await safeFetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return NextResponse.json({ error: 'Timed out fetching sourceUrl' }, { status: 504 })
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid or unsafe sourceUrl' },
        { status: 400 }
      )
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch sourceUrl: ${res.status}` }, { status: 502 })
    }

    const contentType = res.headers.get('content-type')?.split(';')[0].trim() ?? ''
    // Object.hasOwn, not a plain ALLOWED_MIME_TYPES[contentType] lookup -- a plain
    // object literal also resolves inherited Object.prototype members, so
    // contentType: "constructor" (or "__proto__", "toString", "valueOf",
    // "hasOwnProperty") would return a truthy value and sail past this check.
    const ext = Object.hasOwn(ALLOWED_MIME_TYPES, contentType) ? ALLOWED_MIME_TYPES[contentType] : undefined
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    const maxSize = contentType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE

    const contentLength = Number(res.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxSize / (1024 * 1024)}MB)` }, { status: 413 })
    }

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    // Content-Length can't be trusted alone -- a misconfigured or malicious
    // server could omit it or under-report it, so the actual byte count is
    // checked again after the body is fully read.
    if (buffer.byteLength > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxSize / (1024 * 1024)}MB)` }, { status: 413 })
    }

    const s3Key = `media/${workspaceId}/${randomUUID()}.${ext}`
    await putObjectBuffer(s3Key, buffer, contentType)

    const bucket = process.env.AWS_S3_BUCKET!
    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`

    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/from-url error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/upload/from-url/route.test.ts
```

Expected: PASS — 13 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/upload/from-url/route.ts app/api/upload/from-url/route.test.ts
git commit -m "feat: add POST /api/upload/from-url route"
```

---

## Task 4: `attach_media` gateway tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/attach-media.ts`
- Test: `LYRA/lyra-mcp/src/tools/attach-media.test.ts`

**Read `LYRA/lyra-mcp/src/tools/start-media-upload.ts`'s git history or a sibling tool like `src/tools/draft-post.ts` first** for the current thin-wrapper conventions (`resolveWorkspaceId` + `postLyraApi` call shape, error propagation with no try/catch) — `start-media-upload.ts` itself was deleted in Task 2, so if you need to see its exact prior shape, `git show HEAD~1:LYRA/lyra-mcp/src/tools/start-media-upload.ts` (from before Task 2's removal commit) or the plan text below is the reference.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/tools/attach-media.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { attachMedia } from './attach-media'

describe('attachMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('resolves the workspace and forwards to the backend from-url route', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg' })

    const result = await attachMedia(
      { workspace_id: 'ws-1', source_url: 'https://higgsfield.example.com/generated/photo.jpg' },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/from-url', 'token-abc', {
      workspaceId: 'ws-1',
      sourceUrl: 'https://higgsfield.example.com/generated/photo.jpg',
    })
    expect(result).toEqual({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg' })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg' })

    await attachMedia({ source_url: 'https://higgsfield.example.com/generated/photo.jpg' }, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/from-url', 'token-abc', expect.objectContaining({ workspaceId: 'ws-1' }))
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(415, { error: 'File type not permitted' }))

    await expect(
      attachMedia({ workspace_id: 'ws-1', source_url: 'https://example.com/file.exe' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/tools/attach-media.test.ts
```

Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/attach-media.ts
import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface AttachMediaParams {
  workspace_id?: string
  source_url: string
}

interface AttachMediaResult {
  url: string
}

export async function attachMedia(params: AttachMediaParams, bearerToken: string): Promise<AttachMediaResult> {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  return postLyraApi<AttachMediaResult>('/api/upload/from-url', bearerToken, {
    workspaceId: workspace_id,
    sourceUrl: params.source_url,
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/attach-media.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/attach-media.ts src/tools/attach-media.test.ts
git commit -m "feat: add attach_media gateway tool"
```

---

## Task 5: Register `attach_media`, update `draft_post`/`schedule_post` descriptions

**Files:**
- Modify: `LYRA/lyra-mcp/src/mcp-server.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.test.ts`

**Read the current `mcp-server.ts` and `mcp-server.test.ts` in full first** to confirm the exact current shape before editing — this file was modified twice already in this plan (Task 2's removal, and whatever else may have landed since).

- [ ] **Step 1: Update the failing test**

Change the tool-count test back up to 13, adding `attach_media` to the sorted list:

```typescript
  it('registers exactly the 13 core tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'attach_media',
      'call_capability',
      'draft_post',
      'get_analytics',
      'get_brand_profile',
      'get_workspace_overview',
      'list_inbox_items',
      'list_scheduled_posts',
      'list_trends',
      'list_workspaces',
      'respond_to_item',
      'schedule_post',
      'search_capabilities',
    ])
  })
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd LYRA/lyra-mcp
npx vitest run src/mcp-server.test.ts
```

Expected: FAIL — only 12 tools currently registered.

- [ ] **Step 3: Modify `mcp-server.ts`**

Add the import, alongside the existing tool imports:

```typescript
import { attachMedia } from './tools/attach-media'
```

Add one entry to `TOOL_REGISTRY`, after the existing `call_capability` entry (the current last key — verify this is still accurate against the real file before inserting):

```typescript
  attach_media: {
    description: 'Attach an already-hosted image or video to a post by URL -- e.g. an asset produced by an image/video generation tool, which returns a URL rather than raw file bytes. Fetches the URL server-side and returns a new LYRA-hosted URL; pass that into draft_post or schedule_post\'s media_urls to attach it. Images up to 50MB; video up to 25MB (a short clip -- for anything larger, host it externally and note that in the post rather than expecting this tool to handle it).',
    inputSchema: z.object({
      workspace_id: z.string().optional(),
      source_url: z.string(),
    }),
    handler: attachMedia,
  },
```

Update `draft_post`'s description from:

```typescript
    description: 'Create a draft post for a workspace and return its six-dimension content score. Always creates the draft regardless of score -- the score is informational. Optionally attach media via media_urls -- upload images/video first with start_media_upload / upload_media_chunk / complete_media_upload to get a URL.',
```

to:

```typescript
    description: 'Create a draft post for a workspace and return its six-dimension content score. Always creates the draft regardless of score -- the score is informational. Optionally attach media via media_urls -- use attach_media first to get a URL from an already-hosted image/video.',
```

Update `schedule_post`'s description from:

```typescript
    description: 'Schedule a post for a workspace. Routes through the client approval workflow automatically where the workspace requires it -- the actual resulting status (SCHEDULED or PENDING_APPROVAL) is always reported truthfully, regardless of what was requested. Optionally attach media via media_urls -- upload images/video first with start_media_upload / upload_media_chunk / complete_media_upload to get a URL.',
```

to:

```typescript
    description: 'Schedule a post for a workspace. Routes through the client approval workflow automatically where the workspace requires it -- the actual resulting status (SCHEDULED or PENDING_APPROVAL) is always reported truthfully, regardless of what was requested. Optionally attach media via media_urls -- use attach_media first to get a URL from an already-hosted image/video.',
```

Only change the text shown above — don't touch `inputSchema` or any other part of either entry.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/mcp-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Full test suite and typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: both clean, every existing tool's tests still passing unmodified.

- [ ] **Step 6: Commit**

```bash
git add src/mcp-server.ts src/mcp-server.test.ts
git commit -m "feat: register attach_media, update draft_post/schedule_post descriptions"
```

---

## Task 6: Update gateway docs

**Files:**
- Modify: `LYRA/lyra-mcp/README.md`

- [ ] **Step 1: Update the tool count/list and the media-uploads section**

Read the current README first. Change the intro line's tool count from "15 core tools (7 read, 6 write, 2 capability-discovery)" to "13 core tools (7 read, 4 write, 2 capability-discovery)" (write tools are now `draft_post`, `schedule_post`, `respond_to_item`, `attach_media` — 4, not 6).

In the `**Tools:**` list, replace `start_media_upload`, `upload_media_chunk`, `complete_media_upload` with `attach_media` in the write-tools group.

Replace the entire "**Media uploads:**" paragraph:

```markdown
**Media uploads:** `draft_post` and `schedule_post` accept an optional `media_urls: string[]` to attach images/video to a post, but the gateway takes uploads in base64-encoded chunks rather than a single request, so attaching media is a 3-step protocol. First call `start_media_upload` with `filename`, `contentType`, and `totalSizeBytes` to get back an `uploadId` and the `chunkSizeBytes` to use. Then call `upload_media_chunk` once per chunk (each `chunkIndex` paired with a base64-encoded `data` string of up to `chunkSizeBytes`; chunks may be sent in any order) — a small single-chunk image and a large multi-chunk video both use the same calls, just with a different chunk count. Once every chunk has been sent, call `complete_media_upload` with the `uploadId` to get the final public URL, and pass that URL into `draft_post`'s or `schedule_post`'s `media_urls` array to attach it to the post.
```

with:

```markdown
**Media uploads:** `draft_post` and `schedule_post` accept an optional `media_urls: string[]` to attach images/video to a post. To get a URL, call `attach_media` with `source_url` pointing at an already-hosted image or video (e.g. the output of an image/video generation tool) — the backend fetches it server-side and returns a new LYRA-hosted URL. Images up to 50MB, video up to 25MB (a short clip; this is a synchronous fetch-and-upload, not chunked, so it's bounded by how much a single request can move within one call). Pass the returned URL into `draft_post`'s or `schedule_post`'s `media_urls` array to attach it to the post.
```

Also update the second mention of the tool count later in the file ("`call_capability` gives generic access to 16 additional capabilities beyond the 15 core tools") to say "beyond the 13 core tools".

- [ ] **Step 2: Commit**

```bash
cd LYRA/lyra-mcp
git add README.md
git commit -m "docs: document attach_media, remove chunked upload protocol docs"
```

---

## Notes on what's dropped from the prior plan

- **Task 13 from the original chunked-upload plan** (S3 bucket lifecycle rule for abandoned incomplete multipart uploads) is not carried forward — there's no multipart upload left to abandon.
- **Manual end-to-end verification** (previously Task 14) is still needed after this plan's tasks are done, but is not a task here — it's Richard's own manual step: redeploy both repos, then call `attach_media` with a real image URL and a real short-video URL via a live MCP client, confirming the resulting post shows the attached media correctly in the LYRA web app.
