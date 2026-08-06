# LYRA MCP Gateway — Media Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an LLM client attach an image or video to a post before drafting/scheduling it, via a chunked S3 multipart upload protocol exposed as 3 new MCP gateway tools, plus a new `media_urls` field on the existing `draft_post`/`schedule_post` tools.

**Architecture:** New backend routes in `LYRA/lyra` (`app/api/upload/multipart/{start,part,complete}`) do the real S3 work and hold session state in Redis; new tools in `LYRA/lyra-mcp` are thin proxies over them, matching this project's established pattern of the gateway never touching AWS or the database directly.

**Tech Stack:** `@aws-sdk/client-s3` (already installed, `^3.1045.0` — no new dependency, just new commands from the same package), `ioredis` (already installed in both repos), Zod, Next.js route handlers, the existing MCP tool/test conventions from Phases 0-3.

---

## Before you start

Read `docs/superpowers/specs/2026-08-06-mcp-media-upload-design.md` (this feature's spec) first. Every code snippet below was grounded against the real current source of `app/api/upload/presign/route.ts`, `lib/s3.ts`, `lib/redis.ts`, `lib/auth.ts`, `lib/authz.ts`, `lib/rate-limit.ts`, `app/api/posts/route.ts`, and the gateway's `draft-post.ts`/`schedule-post.ts`/`lyra-api-client.ts`/`mcp-server.ts` during this plan's writing — but **re-read each file yourself before editing it**, since exact line numbers will have shifted by the time you get there and this plan can't account for changes made by earlier tasks in this same plan.

**One gap this plan closes that's easy to miss:** `LYRA/lyra-mcp/src/lyra-api-client.ts` currently only has `callLyraApi` (GET), `postLyraApi` (POST), and `deleteLyraApi` (DELETE) — there is no `putLyraApi`, and the `/api/upload/multipart/part` route is a `PUT`. Task 6 adds it.

---

## Task 1: Extend `lib/s3.ts` with multipart upload functions

**Files:**
- Modify: `LYRA/lyra/lib/s3.ts`
- Test: `LYRA/lyra/lib/s3.test.ts`

**Before starting**, check whether `LYRA/lyra/lib/s3.test.ts` already exists. If it does, read it in full and match its existing mocking convention for `@aws-sdk/client-s3` exactly — don't introduce a second, different mocking style in the same file. If it doesn't exist, create it using the pattern below.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/lib/s3.test.ts (add these — merge with any existing file/mocks rather than duplicating)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
  }
})

import {
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
} from './s3'

describe('multipart upload functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createMultipartUpload returns the real S3 UploadId', async () => {
    sendMock.mockResolvedValue({ UploadId: 'real-upload-id-123' })
    const uploadId = await createMultipartUpload('media/ws-1/file.mp4', 'video/mp4')
    expect(uploadId).toBe('real-upload-id-123')
  })

  it('createMultipartUpload throws if S3 does not return an UploadId', async () => {
    sendMock.mockResolvedValue({})
    await expect(createMultipartUpload('media/ws-1/file.mp4', 'video/mp4')).rejects.toThrow('UploadId')
  })

  it('uploadPart returns the real S3 ETag', async () => {
    sendMock.mockResolvedValue({ ETag: '"abc123etag"' })
    const etag = await uploadPart('media/ws-1/file.mp4', 'real-upload-id-123', 1, Buffer.from('chunk data'))
    expect(etag).toBe('"abc123etag"')
  })

  it('uploadPart throws if S3 does not return an ETag', async () => {
    sendMock.mockResolvedValue({})
    await expect(uploadPart('media/ws-1/file.mp4', 'real-upload-id-123', 1, Buffer.from('x'))).rejects.toThrow('ETag')
  })

  it('completeMultipartUpload sends the parts list in part-number order', async () => {
    sendMock.mockResolvedValue({})
    await completeMultipartUpload('media/ws-1/file.mp4', 'real-upload-id-123', [
      { partNumber: 1, etag: '"etag1"' },
      { partNumber: 2, etag: '"etag2"' },
    ])
    expect(sendMock).toHaveBeenCalledTimes(1)
    const commandArg = sendMock.mock.calls[0][0]
    expect(commandArg.input.MultipartUpload.Parts).toEqual([
      { PartNumber: 1, ETag: '"etag1"' },
      { PartNumber: 2, ETag: '"etag2"' },
    ])
  })

  it('abortMultipartUpload calls S3 with the right key and upload id', async () => {
    sendMock.mockResolvedValue({})
    await abortMultipartUpload('media/ws-1/file.mp4', 'real-upload-id-123')
    expect(sendMock).toHaveBeenCalledTimes(1)
    const commandArg = sendMock.mock.calls[0][0]
    expect(commandArg.input.Key).toBe('media/ws-1/file.mp4')
    expect(commandArg.input.UploadId).toBe('real-upload-id-123')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra
npx vitest run lib/s3.test.ts
```

Expected: FAIL — the 4 new functions don't exist yet.

- [ ] **Step 3: Write the implementation**

Add to `LYRA/lyra/lib/s3.ts`. First, extend the existing import line to add the 4 new commands (keep every existing import):

```typescript
import {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
```

Then append these 4 new exported functions after the existing `putObjectBuffer` function (keep every existing function untouched):

```typescript
/** Opens a real S3 multipart upload session. Returns the real S3 UploadId. */
export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }))
  if (!res.UploadId) throw new Error('S3 did not return an UploadId')
  return res.UploadId
}

/** Uploads one part of a multipart upload. partNumber is 1-indexed, per S3's convention. Returns the part's ETag. */
export async function uploadPart(key: string, s3UploadId: string, partNumber: number, body: Buffer): Promise<string> {
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

/** Aborts a multipart upload, discarding any parts already uploaded. Used when a session fails validation at completion time. */
export async function abortMultipartUpload(key: string, s3UploadId: string): Promise<void> {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: s3UploadId }))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run lib/s3.test.ts
```

Expected: PASS — 5 new tests, plus every pre-existing test in the file still passing.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/s3.ts lib/s3.test.ts
git commit -m "feat: add S3 multipart upload functions to lib/s3.ts"
```

---

## Task 2: Add `lib/upload-session.ts` — Redis-backed multipart session state

**Files:**
- Create: `LYRA/lyra/lib/upload-session.ts`
- Test: `LYRA/lyra/lib/upload-session.test.ts`

Session metadata (S3 key, S3 UploadId, owner, expected part count) is immutable after creation and stored as one Redis string. Received parts are stored in a **separate Redis hash**, one field per chunk index — this is deliberate: a hash's per-field `HSET` is atomic, so two chunks recorded concurrently can never race and clobber each other the way a read-modify-write on a single JSON blob would.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/lib/upload-session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/redis', () => ({
  redisClient: {
    set: vi.fn(),
    get: vi.fn(),
    hset: vi.fn(),
    hgetall: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  },
}))

import { redisClient } from '@/lib/redis'
import {
  createUploadSession,
  getUploadSessionMeta,
  recordPart,
  getReceivedParts,
  deleteUploadSession,
  type UploadSessionMeta,
} from './upload-session'

const SAMPLE_META: UploadSessionMeta = {
  s3Key: 'media/ws-1/file.mp4',
  s3UploadId: 'real-upload-id-123',
  workspaceId: 'ws-1',
  userId: 'user-1',
  contentType: 'video/mp4',
  totalSizeBytes: 12_000_000,
  chunkSizeBytes: 6_000_000,
  expectedParts: 2,
}

describe('upload-session', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createUploadSession stores the meta as JSON with a 24-hour expiry', async () => {
    await createUploadSession('upload-1', SAMPLE_META)
    expect(redisClient.set).toHaveBeenCalledWith(
      'media-upload:upload-1:meta',
      JSON.stringify(SAMPLE_META),
      'EX',
      24 * 60 * 60
    )
  })

  it('getUploadSessionMeta returns null when the session does not exist', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null)
    const result = await getUploadSessionMeta('missing')
    expect(result).toBeNull()
  })

  it('getUploadSessionMeta parses and returns stored meta', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(SAMPLE_META))
    const result = await getUploadSessionMeta('upload-1')
    expect(result).toEqual(SAMPLE_META)
  })

  it('recordPart writes the etag to the parts hash and refreshes its expiry', async () => {
    await recordPart('upload-1', 0, '"etag-for-part-0"')
    expect(redisClient.hset).toHaveBeenCalledWith('media-upload:upload-1:parts', '0', '"etag-for-part-0"')
    expect(redisClient.expire).toHaveBeenCalledWith('media-upload:upload-1:parts', 24 * 60 * 60)
  })

  it('getReceivedParts converts hash field keys back to numbers', async () => {
    vi.mocked(redisClient.hgetall).mockResolvedValue({ '0': '"etag-0"', '1': '"etag-1"' })
    const result = await getReceivedParts('upload-1')
    expect(result).toEqual({ 0: '"etag-0"', 1: '"etag-1"' })
  })

  it('getReceivedParts returns an empty object when no parts have been recorded', async () => {
    vi.mocked(redisClient.hgetall).mockResolvedValue({})
    const result = await getReceivedParts('upload-1')
    expect(result).toEqual({})
  })

  it('deleteUploadSession removes both the meta key and the parts hash', async () => {
    await deleteUploadSession('upload-1')
    expect(redisClient.del).toHaveBeenCalledWith('media-upload:upload-1:meta', 'media-upload:upload-1:parts')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra
npx vitest run lib/upload-session.test.ts
```

Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/lib/upload-session.ts
import { redisClient } from '@/lib/redis'

export interface UploadSessionMeta {
  s3Key: string
  s3UploadId: string
  workspaceId: string
  userId: string
  contentType: string
  totalSizeBytes: number
  chunkSizeBytes: number
  expectedParts: number
}

const TTL_SECONDS = 24 * 60 * 60 // 24 hours

const metaKey = (uploadId: string) => `media-upload:${uploadId}:meta`
const partsKey = (uploadId: string) => `media-upload:${uploadId}:parts`

export async function createUploadSession(uploadId: string, meta: UploadSessionMeta): Promise<void> {
  await redisClient.set(metaKey(uploadId), JSON.stringify(meta), 'EX', TTL_SECONDS)
}

export async function getUploadSessionMeta(uploadId: string): Promise<UploadSessionMeta | null> {
  const raw = await redisClient.get(metaKey(uploadId))
  if (!raw) return null
  return JSON.parse(raw) as UploadSessionMeta
}

// Atomic per-field write via a Redis hash -- safe even if two chunks are
// recorded concurrently, unlike a read-modify-write on a single JSON blob
// would be (which is why parts are NOT stored inside the meta JSON above).
export async function recordPart(uploadId: string, chunkIndex: number, etag: string): Promise<void> {
  await redisClient.hset(partsKey(uploadId), String(chunkIndex), etag)
  await redisClient.expire(partsKey(uploadId), TTL_SECONDS)
}

export async function getReceivedParts(uploadId: string): Promise<Record<number, string>> {
  const raw = await redisClient.hgetall(partsKey(uploadId))
  const parts: Record<number, string> = {}
  for (const [chunkIndex, etag] of Object.entries(raw)) {
    parts[Number(chunkIndex)] = etag
  }
  return parts
}

export async function deleteUploadSession(uploadId: string): Promise<void> {
  await redisClient.del(metaKey(uploadId), partsKey(uploadId))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run lib/upload-session.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/upload-session.ts lib/upload-session.test.ts
git commit -m "feat: add Redis-backed multipart upload session state"
```

---

## Task 3: `POST /api/upload/multipart/start` route

**Files:**
- Create: `LYRA/lyra/app/api/upload/multipart/start/route.ts`
- Test: `LYRA/lyra/app/api/upload/multipart/start/route.test.ts`

This route's auth/validation shape is a direct copy of `app/api/upload/presign/route.ts`'s conventions — read that file in full first to confirm nothing has changed since this plan was written, then follow the same shape below.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/app/api/upload/multipart/start/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspaceAccess: { findFirst: vi.fn() } } }))
vi.mock('@/lib/s3', () => ({ createMultipartUpload: vi.fn() }))
vi.mock('@/lib/upload-session', () => ({ createUploadSession: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))
vi.mock('@/lib/authz', () => ({ canWrite: (role: string) => role !== 'CLIENT_VIEW' }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createMultipartUpload } from '@/lib/s3'
import { createUploadSession } from '@/lib/upload-session'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/upload/multipart/start', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload/multipart/start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(createMultipartUpload).mockResolvedValue('real-upload-id-123')
  })

  it('opens a real multipart session and returns an uploadId plus chunk size', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 2_000_000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.uploadId).toBe('string')
    expect(body.chunkSizeBytes).toBe(6 * 1024 * 1024)
    expect(createUploadSession).toHaveBeenCalledWith(body.uploadId, expect.objectContaining({
      s3Key: expect.stringMatching(/^media\/ws-1\/.+\.jpg$/),
      s3UploadId: 'real-upload-id-123',
      workspaceId: 'ws-1',
      userId: 'user-1',
      contentType: 'image/jpeg',
      totalSizeBytes: 2_000_000,
      expectedParts: 1,
    }))
  })

  it('rejects an unsupported content type before touching S3', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'x.exe', contentType: 'application/x-msdownload', totalSizeBytes: 1000 }))
    expect(res.status).toBe(415)
    expect(createMultipartUpload).not.toHaveBeenCalled()
  })

  it('rejects an image over 50MB', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'huge.png', contentType: 'image/png', totalSizeBytes: 51 * 1024 * 1024 }))
    expect(res.status).toBe(413)
  })

  it('allows a video up to 200MB, rejects over', async () => {
    const ok = await POST(req({ workspaceId: 'ws-1', filename: 'clip.mp4', contentType: 'video/mp4', totalSizeBytes: 199 * 1024 * 1024 }))
    expect(ok.status).toBe(200)

    const tooLarge = await POST(req({ workspaceId: 'ws-1', filename: 'clip.mp4', contentType: 'video/mp4', totalSizeBytes: 201 * 1024 * 1024 }))
    expect(tooLarge.status).toBe(413)
  })

  it('requires workspaceId', async () => {
    const res = await POST(req({ filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the caller has no write access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(403)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(429)
  })

  it('computes expectedParts correctly for a file spanning multiple chunks', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'clip.mp4', contentType: 'video/mp4', totalSizeBytes: 13 * 1024 * 1024 }))
    const body = await res.json()
    // 13MB / 6MB chunks = 3 parts (6 + 6 + 1)
    expect(createUploadSession).toHaveBeenCalledWith(body.uploadId, expect.objectContaining({ expectedParts: 3 }))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra
npx vitest run app/api/upload/multipart/start/route.test.ts
```

Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/app/api/upload/multipart/start/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createMultipartUpload } from '@/lib/s3'
import { createUploadSession } from '@/lib/upload-session'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50 MB, matches the existing presign route's limit
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200 MB
const CHUNK_SIZE_BYTES = 6 * 1024 * 1024 // 6 MB -- comfortably above S3's 5MB-per-part minimum

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`upload-multipart-start:${user.id}`, 30, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, contentType, totalSizeBytes } = (await req.json()) as {
      workspaceId?: string
      filename?: string
      contentType: string
      totalSizeBytes: number
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const ext = ALLOWED_MIME_TYPES[contentType]
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    const maxSize = contentType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (typeof totalSizeBytes !== 'number' || totalSizeBytes <= 0) {
      return NextResponse.json({ error: 'totalSizeBytes must be a positive number' }, { status: 400 })
    }
    if (totalSizeBytes > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxSize / (1024 * 1024)}MB)` }, { status: 413 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const s3Key = `media/${workspaceId}/${randomUUID()}.${ext}`
    const s3UploadId = await createMultipartUpload(s3Key, contentType)
    const expectedParts = Math.ceil(totalSizeBytes / CHUNK_SIZE_BYTES)
    const uploadId = randomUUID()

    await createUploadSession(uploadId, {
      s3Key,
      s3UploadId,
      workspaceId,
      userId: user.id,
      contentType,
      totalSizeBytes,
      chunkSizeBytes: CHUNK_SIZE_BYTES,
      expectedParts,
    })

    return NextResponse.json({ uploadId, chunkSizeBytes: CHUNK_SIZE_BYTES })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/multipart/start error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/upload/multipart/start/route.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/upload/multipart/start/route.ts app/api/upload/multipart/start/route.test.ts
git commit -m "feat: add POST /api/upload/multipart/start route"
```

---

## Task 4: `PUT /api/upload/multipart/part` route

**Files:**
- Create: `LYRA/lyra/app/api/upload/multipart/part/route.ts`
- Test: `LYRA/lyra/app/api/upload/multipart/part/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/app/api/upload/multipart/part/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/s3', () => ({ uploadPart: vi.fn() }))
vi.mock('@/lib/upload-session', () => ({
  getUploadSessionMeta: vi.fn(),
  recordPart: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 119 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

import { requireAuth } from '@/lib/auth'
import { uploadPart } from '@/lib/s3'
import { getUploadSessionMeta, recordPart } from '@/lib/upload-session'
import { checkRateLimit } from '@/lib/rate-limit'
import { PUT } from './route'

const SESSION = {
  s3Key: 'media/ws-1/file.mp4',
  s3UploadId: 'real-upload-id-123',
  workspaceId: 'ws-1',
  userId: 'user-1',
  contentType: 'video/mp4',
  totalSizeBytes: 12_000_000,
  chunkSizeBytes: 6_000_000,
  expectedParts: 2,
}

function req(body: unknown) {
  return new Request('http://localhost/api/upload/multipart/part', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/upload/multipart/part', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 119 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getUploadSessionMeta).mockResolvedValue(SESSION)
    vi.mocked(uploadPart).mockResolvedValue('"real-etag"')
  })

  it('uploads the chunk to S3 with a 1-indexed part number and records the etag', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: Buffer.from('chunk bytes').toString('base64') }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ received: true, chunkIndex: 0 })
    expect(uploadPart).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123', 1, Buffer.from('chunk bytes'))
    expect(recordPart).toHaveBeenCalledWith('upload-1', 0, '"real-etag"')
  })

  it('returns 404 when the upload session does not exist or has expired', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue(null)
    const res = await PUT(req({ uploadId: 'missing', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(404)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('returns 403 when the session belongs to a different user', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue({ ...SESSION, userId: 'someone-else' })
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(403)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('rejects a chunkIndex outside the expected range', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 5, data: 'YQ==' }))
    expect(res.status).toBe(400)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('requires uploadId, chunkIndex, and data', async () => {
    const res = await PUT(req({ chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra
npx vitest run app/api/upload/multipart/part/route.test.ts
```

Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/app/api/upload/multipart/part/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { uploadPart } from '@/lib/s3'
import { getUploadSessionMeta, recordPart } from '@/lib/upload-session'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`upload-multipart-part:${user.id}`, 120, 60)
    if (!allowed) return rateLimitResponse()

    const { uploadId, chunkIndex, data } = (await req.json()) as {
      uploadId?: string
      chunkIndex?: number
      data?: string
    }

    if (!uploadId || typeof chunkIndex !== 'number' || chunkIndex < 0 || !data) {
      return NextResponse.json({ error: 'uploadId, chunkIndex, and data are required' }, { status: 400 })
    }

    const session = await getUploadSessionMeta(uploadId)
    if (!session) {
      return NextResponse.json({ error: 'Upload session not found or expired' }, { status: 404 })
    }
    if (session.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (chunkIndex >= session.expectedParts) {
      return NextResponse.json(
        { error: `chunkIndex out of range (expected 0-${session.expectedParts - 1})` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(data, 'base64')
    // S3 part numbers are 1-indexed; chunkIndex from the client is 0-indexed.
    const etag = await uploadPart(session.s3Key, session.s3UploadId, chunkIndex + 1, buffer)
    await recordPart(uploadId, chunkIndex, etag)

    return NextResponse.json({ received: true, chunkIndex })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PUT /api/upload/multipart/part error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/upload/multipart/part/route.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/upload/multipart/part/route.ts app/api/upload/multipart/part/route.test.ts
git commit -m "feat: add PUT /api/upload/multipart/part route"
```

---

## Task 5: `POST /api/upload/multipart/complete` route

**Files:**
- Create: `LYRA/lyra/app/api/upload/multipart/complete/route.ts`
- Test: `LYRA/lyra/app/api/upload/multipart/complete/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra/app/api/upload/multipart/complete/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/s3', () => ({ completeMultipartUpload: vi.fn(), abortMultipartUpload: vi.fn() }))
vi.mock('@/lib/upload-session', () => ({
  getUploadSessionMeta: vi.fn(),
  getReceivedParts: vi.fn(),
  deleteUploadSession: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

import { requireAuth } from '@/lib/auth'
import { completeMultipartUpload, abortMultipartUpload } from '@/lib/s3'
import { getUploadSessionMeta, getReceivedParts, deleteUploadSession } from '@/lib/upload-session'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const SESSION = {
  s3Key: 'media/ws-1/file.mp4',
  s3UploadId: 'real-upload-id-123',
  workspaceId: 'ws-1',
  userId: 'user-1',
  contentType: 'video/mp4',
  totalSizeBytes: 12_000_000,
  chunkSizeBytes: 6_000_000,
  expectedParts: 2,
}

function req(body: unknown) {
  return new Request('http://localhost/api/upload/multipart/complete', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload/multipart/complete', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET', 'lyra-media-test')
    vi.stubEnv('S3_REGION', 'ap-southeast-2')
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getUploadSessionMeta).mockResolvedValue(SESSION)
    vi.mocked(getReceivedParts).mockResolvedValue({ 0: '"etag-0"', 1: '"etag-1"' })
  })

  it('completes the S3 upload with parts sorted by part number and returns the public URL', async () => {
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/media/ws-1/file.mp4')
    expect(completeMultipartUpload).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123', [
      { partNumber: 1, etag: '"etag-0"' },
      { partNumber: 2, etag: '"etag-1"' },
    ])
    expect(deleteUploadSession).toHaveBeenCalledWith('upload-1')
  })

  it('returns 422 naming exactly which chunks are missing', async () => {
    vi.mocked(getReceivedParts).mockResolvedValue({ 0: '"etag-0"' }) // part 1 (index 1) missing
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('1')
    expect(completeMultipartUpload).not.toHaveBeenCalled()
  })

  it('returns 404 when the upload session does not exist or has expired', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue(null)
    const res = await POST(req({ uploadId: 'missing' }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when the session belongs to a different user', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue({ ...SESSION, userId: 'someone-else' })
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(403)
  })

  it('requires uploadId', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(429)
  })

  it('aborts the multipart upload and returns 500 if S3 completion fails', async () => {
    vi.mocked(completeMultipartUpload).mockRejectedValue(new Error('S3: InvalidPart'))
    vi.mocked(abortMultipartUpload).mockResolvedValue(undefined)

    const res = await POST(req({ uploadId: 'upload-1' }))

    expect(res.status).toBe(500)
    expect(abortMultipartUpload).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123')
    expect(deleteUploadSession).not.toHaveBeenCalled() // session left in place -- nothing to retry against once aborted, but not this route's job to clean that up
  })

  it('still returns 500 for the original completion error if the abort attempt itself also fails', async () => {
    vi.mocked(completeMultipartUpload).mockRejectedValue(new Error('S3: InvalidPart'))
    vi.mocked(abortMultipartUpload).mockRejectedValue(new Error('S3: NoSuchUpload'))

    const res = await POST(req({ uploadId: 'upload-1' }))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error') // generic message -- the original completion error, not the abort failure, drives the response
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra
npx vitest run app/api/upload/multipart/complete/route.test.ts
```

Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/app/api/upload/multipart/complete/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { completeMultipartUpload, abortMultipartUpload } from '@/lib/s3'
import { getUploadSessionMeta, getReceivedParts, deleteUploadSession } from '@/lib/upload-session'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`upload-multipart-complete:${user.id}`, 30, 60)
    if (!allowed) return rateLimitResponse()

    const { uploadId } = (await req.json()) as { uploadId?: string }
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId required' }, { status: 400 })
    }

    const session = await getUploadSessionMeta(uploadId)
    if (!session) {
      return NextResponse.json({ error: 'Upload session not found or expired' }, { status: 404 })
    }
    if (session.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const receivedParts = await getReceivedParts(uploadId)
    const missing: number[] = []
    for (let i = 0; i < session.expectedParts; i++) {
      if (!(i in receivedParts)) missing.push(i)
    }
    if (missing.length > 0) {
      return NextResponse.json({ error: `Missing chunks: ${missing.join(', ')}` }, { status: 422 })
    }

    const parts = Object.entries(receivedParts)
      .map(([chunkIndex, etag]) => ({ partNumber: Number(chunkIndex) + 1, etag }))
      .sort((a, b) => a.partNumber - b.partNumber)

    try {
      await completeMultipartUpload(session.s3Key, session.s3UploadId, parts)
    } catch (completeError) {
      // Clean up eagerly rather than leaving this multipart upload for the
      // bucket's 3-day AbortIncompleteMultipartUpload lifecycle rule (Task 13)
      // to reclaim -- but never let an abort failure mask the real error.
      try {
        await abortMultipartUpload(session.s3Key, session.s3UploadId)
      } catch (abortError) {
        console.error('POST /api/upload/multipart/complete: abort-after-failure also failed:', abortError)
      }
      throw completeError
    }

    await deleteUploadSession(uploadId)

    const bucket = process.env.AWS_S3_BUCKET!
    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${session.s3Key}`

    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/multipart/complete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/upload/multipart/complete/route.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/upload/multipart/complete/route.ts app/api/upload/multipart/complete/route.test.ts
git commit -m "feat: add POST /api/upload/multipart/complete route"
```

---

## Task 6: Add `putLyraApi` to the gateway's API client

**Files:**
- Modify: `LYRA/lyra-mcp/src/lyra-api-client.ts`
- Modify: `LYRA/lyra-mcp/src/lyra-api-client.test.ts`

**Read the current file in full first** — `callLyraApi`/`postLyraApi`/`deleteLyraApi` have each been through review rounds since Phase 3 began; match whatever the real current structure is (error classes, `TIMEOUT_MS`, header shape) rather than assuming it's identical to what's described here.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/lyra-api-client.test.ts (add these to the existing file, merge the import)
describe('putLyraApi', () => {
  it('PUTs the body with the bearer token and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ received: true, chunkIndex: 0 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await putLyraApi('/api/upload/multipart/part', 'token-abc', { uploadId: 'u-1', chunkIndex: 0, data: 'YQ==' })

    expect(result).toEqual({ received: true, chunkIndex: 0 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://lyraonline.ai/api/upload/multipart/part')
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-abc', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ uploadId: 'u-1', chunkIndex: 0, data: 'YQ==' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws LyraApiError on a non-ok response, same as callLyraApi/postLyraApi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'Missing chunks: 1' }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(putLyraApi('/api/upload/multipart/part', 'token-abc', {})).rejects.toMatchObject({
      status: 422,
      body: { error: 'Missing chunks: 1' },
    })
  })

  it('throws LyraApiTimeoutError on a real timeout', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(putLyraApi('/api/upload/multipart/part', 'token-abc', {})).rejects.toThrow(LyraApiTimeoutError)
  })
})
```

Merge `putLyraApi` into the test file's existing import statement (alongside `callLyraApi`, `postLyraApi`, `deleteLyraApi`, `LyraApiTimeoutError`, `LyraApiError`) — don't duplicate the import line. Match the exact base-URL/mocking convention the existing `postLyraApi` tests already use in this same file if it differs from `https://lyraonline.ai` above.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/lyra-api-client.test.ts
```

Expected: FAIL — `putLyraApi` isn't exported yet.

- [ ] **Step 3: Write the implementation**

Add to `src/lyra-api-client.ts`, after `postLyraApi`, mirroring its exact structure with `method: 'PUT'` in place of `'POST'` — keep every existing export unchanged:

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

If the real current `postLyraApi` differs from this shape (e.g. different header construction, different error class constructor signatures), match the real file exactly rather than this snippet — the goal is a PUT-verb sibling with identical conventions to whatever POST/DELETE actually look like today.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lyra-api-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lyra-api-client.ts src/lyra-api-client.test.ts
git commit -m "feat: add putLyraApi PUT support to the gateway's API client"
```

---

## Task 7: `start_media_upload` gateway tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/start-media-upload.ts`
- Test: `LYRA/lyra-mcp/src/tools/start-media-upload.test.ts`

**Read `src/tools/schedule-post.ts` and its test file in full first** — this task's handler and test follow that exact structural pattern (resolve workspace, call the backend, return a plain object; `vi.mock` with `importOriginal` for `lyra-api-client`, wholesale mocks for `resolve-workspace-id`/`get-workspace-name`).

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/tools/start-media-upload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { startMediaUpload } from './start-media-upload'

describe('startMediaUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('resolves the workspace and forwards to the backend start route', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ uploadId: 'upload-1', chunkSizeBytes: 6291456 })

    const result = await startMediaUpload(
      { workspace_id: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 2_000_000 },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/multipart/start', 'token-abc', {
      workspaceId: 'ws-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      totalSizeBytes: 2_000_000,
    })
    expect(result).toEqual({ uploadId: 'upload-1', chunkSizeBytes: 6291456 })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ uploadId: 'upload-1', chunkSizeBytes: 6291456 })

    await startMediaUpload({ filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 2_000_000 }, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/multipart/start', 'token-abc', expect.objectContaining({ workspaceId: 'ws-1' }))
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(413, { error: 'File too large (max 50MB)' }))

    await expect(
      startMediaUpload({ workspace_id: 'ws-1', filename: 'huge.png', contentType: 'image/png', totalSizeBytes: 60_000_000 }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/tools/start-media-upload.test.ts
```

Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/start-media-upload.ts
import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface StartMediaUploadParams {
  workspace_id?: string
  filename: string
  contentType: string
  totalSizeBytes: number
}

interface StartMediaUploadResult {
  uploadId: string
  chunkSizeBytes: number
}

export async function startMediaUpload(params: StartMediaUploadParams, bearerToken: string): Promise<StartMediaUploadResult> {
  const workspaceId = await resolveWorkspaceId(params.workspace_id, bearerToken)

  return postLyraApi<StartMediaUploadResult>('/api/upload/multipart/start', bearerToken, {
    workspaceId,
    filename: params.filename,
    contentType: params.contentType,
    totalSizeBytes: params.totalSizeBytes,
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/start-media-upload.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/start-media-upload.ts src/tools/start-media-upload.test.ts
git commit -m "feat: add start_media_upload gateway tool"
```

---

## Task 8: `upload_media_chunk` gateway tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/upload-media-chunk.ts`
- Test: `LYRA/lyra-mcp/src/tools/upload-media-chunk.test.ts`

This tool does **not** resolve `workspace_id` — an upload session is already scoped to a workspace from `start_media_upload`, and the backend's `/api/upload/multipart/part` route checks session ownership by user, not by a re-supplied workspace id.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/tools/upload-media-chunk.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, putLyraApi: vi.fn() }
})

import { putLyraApi } from '../lyra-api-client'
import { uploadMediaChunk } from './upload-media-chunk'

describe('uploadMediaChunk', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards the chunk to the backend part route unchanged', async () => {
    vi.mocked(putLyraApi).mockResolvedValue({ received: true, chunkIndex: 0 })

    const result = await uploadMediaChunk({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }, 'token-abc')

    expect(putLyraApi).toHaveBeenCalledWith('/api/upload/multipart/part', 'token-abc', {
      uploadId: 'upload-1',
      chunkIndex: 0,
      data: 'YQ==',
    })
    expect(result).toEqual({ received: true, chunkIndex: 0 })
  })

  it('does not call resolveWorkspaceId -- the upload session already carries workspace context', async () => {
    vi.mocked(putLyraApi).mockResolvedValue({ received: true, chunkIndex: 1 })
    await uploadMediaChunk({ uploadId: 'upload-1', chunkIndex: 1, data: 'Yg==' }, 'token-abc')
    // No assertion needed beyond the call above succeeding without a workspace_id param in the input type at all --
    // this test exists to document the deliberate omission for a future reader, not to assert a negative on a mock.
    expect(putLyraApi).toHaveBeenCalledTimes(1)
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(putLyraApi).mockRejectedValue(new LyraApiError(404, { error: 'Upload session not found or expired' }))

    await expect(
      uploadMediaChunk({ uploadId: 'expired-upload', chunkIndex: 0, data: 'YQ==' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/tools/upload-media-chunk.test.ts
```

Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/upload-media-chunk.ts
import { putLyraApi } from '../lyra-api-client'

interface UploadMediaChunkParams {
  uploadId: string
  chunkIndex: number
  data: string
}

interface UploadMediaChunkResult {
  received: true
  chunkIndex: number
}

// No workspace_id resolution here -- the upload session created by
// start_media_upload already carries workspace context server-side, and the
// backend route checks session ownership by user id, not a re-supplied
// workspace id.
export async function uploadMediaChunk(params: UploadMediaChunkParams, bearerToken: string): Promise<UploadMediaChunkResult> {
  return putLyraApi<UploadMediaChunkResult>('/api/upload/multipart/part', bearerToken, {
    uploadId: params.uploadId,
    chunkIndex: params.chunkIndex,
    data: params.data,
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/upload-media-chunk.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/upload-media-chunk.ts src/tools/upload-media-chunk.test.ts
git commit -m "feat: add upload_media_chunk gateway tool"
```

---

## Task 9: `complete_media_upload` gateway tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/complete-media-upload.ts`
- Test: `LYRA/lyra-mcp/src/tools/complete-media-upload.test.ts`

Same no-workspace-resolution reasoning as Task 8.

- [ ] **Step 1: Write the failing tests**

```typescript
// LYRA/lyra-mcp/src/tools/complete-media-upload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})

import { postLyraApi } from '../lyra-api-client'
import { completeMediaUpload } from './complete-media-upload'

describe('completeMediaUpload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards to the backend complete route and returns the real URL', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/file.jpg' })

    const result = await completeMediaUpload({ uploadId: 'upload-1' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/multipart/complete', 'token-abc', { uploadId: 'upload-1' })
    expect(result).toEqual({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/file.jpg' })
  })

  it('propagates a 422 missing-chunks error from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(422, { error: 'Missing chunks: 2, 3' }))

    await expect(completeMediaUpload({ uploadId: 'upload-1' }, 'token-abc')).rejects.toThrow(LyraApiError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/tools/complete-media-upload.test.ts
```

Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/complete-media-upload.ts
import { postLyraApi } from '../lyra-api-client'

interface CompleteMediaUploadParams {
  uploadId: string
}

interface CompleteMediaUploadResult {
  url: string
}

export async function completeMediaUpload(params: CompleteMediaUploadParams, bearerToken: string): Promise<CompleteMediaUploadResult> {
  return postLyraApi<CompleteMediaUploadResult>('/api/upload/multipart/complete', bearerToken, {
    uploadId: params.uploadId,
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/complete-media-upload.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/complete-media-upload.ts src/tools/complete-media-upload.test.ts
git commit -m "feat: add complete_media_upload gateway tool"
```

---

## Task 10: Register the 3 new tools in `TOOL_REGISTRY`

**Files:**
- Modify: `LYRA/lyra-mcp/src/mcp-server.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.test.ts`

**Read the current `mcp-server.ts` and `mcp-server.test.ts` in full first** — the tool-count test currently expects 12; confirm the exact current test name/structure before editing, and confirm the current `TOOL_REGISTRY` object's exact key order before deciding where to insert (append after the last existing key, matching this project's established convention of appending new tools at the end rather than reordering existing ones).

- [ ] **Step 1: Update the failing test**

```typescript
// LYRA/lyra-mcp/src/mcp-server.test.ts (update the existing tool-count/name-list test)
it('registers exactly the 15 core tools', () => {
  expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
    'call_capability',
    'complete_media_upload',
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
    'start_media_upload',
    'upload_media_chunk',
  ])
})
```

Keep every other existing test in the file unchanged.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd LYRA/lyra-mcp
npx vitest run src/mcp-server.test.ts
```

Expected: FAIL — only 12 tools currently registered.

- [ ] **Step 3: Modify `mcp-server.ts`**

Add the imports, alongside the existing tool imports:

```typescript
import { startMediaUpload } from './tools/start-media-upload'
import { uploadMediaChunk } from './tools/upload-media-chunk'
import { completeMediaUpload } from './tools/complete-media-upload'
```

Add three entries to `TOOL_REGISTRY`, after the existing `call_capability` entry (the current last key):

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

No changes needed to `createToolCallback` or the registration loop — all three new tools go through the exact same wrapper as every other tool.

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
git commit -m "feat: register start_media_upload, upload_media_chunk, complete_media_upload in TOOL_REGISTRY"
```

---

## Task 11: Extend `draft_post`/`schedule_post` with `media_urls`

**Files:**
- Modify: `LYRA/lyra-mcp/src/tools/draft-post.ts`
- Modify: `LYRA/lyra-mcp/src/tools/draft-post.test.ts`
- Modify: `LYRA/lyra-mcp/src/tools/schedule-post.ts`
- Modify: `LYRA/lyra-mcp/src/tools/schedule-post.test.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.test.ts` (if it separately asserts each tool's `inputSchema` shape — check before assuming)

**Read the current `draft-post.ts` and `schedule-post.ts` in full first.** The backend's `POST /api/posts` route already accepts `mediaUrls: z.array(z.string()).optional()` — this task only adds the field to the gateway's request body and public tool schema, no backend change needed.

- [ ] **Step 1: Write the failing tests**

Add to `LYRA/lyra-mcp/src/tools/draft-post.test.ts`:

```typescript
  it('forwards media_urls to the backend when provided', async () => {
    vi.mocked(postLyraApi).mockImplementation((path) =>
      path === '/api/posts'
        ? Promise.resolve([{ id: 'post-1', status: 'DRAFT', socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])
        : Promise.resolve({ overallScore: 80, dimensions: {} })
    )

    await draftPost(
      { workspace_id: 'ws-1', content: 'A caption', platforms: ['INSTAGRAM'], media_urls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'] },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', expect.objectContaining({
      mediaUrls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'],
    }))
  })

  it('omits mediaUrls from the backend call entirely when not provided', async () => {
    vi.mocked(postLyraApi).mockImplementation((path) =>
      path === '/api/posts'
        ? Promise.resolve([{ id: 'post-1', status: 'DRAFT', socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])
        : Promise.resolve({ overallScore: 80, dimensions: {} })
    )

    await draftPost({ workspace_id: 'ws-1', content: 'A caption', platforms: ['INSTAGRAM'] }, 'token-abc')

    const postsCall = vi.mocked(postLyraApi).mock.calls.find(([path]) => path === '/api/posts')
    expect(postsCall?.[2]).not.toHaveProperty('mediaUrls')
  })
```

Add the equivalent pair to `LYRA/lyra-mcp/src/tools/schedule-post.test.ts`:

```typescript
  it('forwards media_urls to the backend when provided', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([{ id: 'post-1', status: 'SCHEDULED', socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])

    await schedulePost(
      {
        workspace_id: 'ws-1',
        content: 'A caption',
        platforms: ['INSTAGRAM'],
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        media_urls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'],
      },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', expect.objectContaining({
      mediaUrls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'],
    }))
  })

  it('omits mediaUrls from the backend call entirely when not provided', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([{ id: 'post-1', status: 'SCHEDULED', socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])

    await schedulePost(
      { workspace_id: 'ws-1', content: 'A caption', platforms: ['INSTAGRAM'], scheduledAt: new Date(Date.now() + 86_400_000).toISOString() },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', expect.not.objectContaining({ mediaUrls: expect.anything() }))
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/tools/draft-post.test.ts src/tools/schedule-post.test.ts
```

Expected: FAIL — `media_urls` isn't accepted or forwarded yet.

- [ ] **Step 3: Modify the implementations**

In `src/tools/draft-post.ts`, add `media_urls` to the params interface and conditionally spread it into the backend call:

```typescript
interface DraftPostParams {
  workspace_id?: string
  content: string
  platforms: string[]
  media_urls?: string[]
}
```

Change the `postLyraApi<CreatedPost[]>('/api/posts', ...)` call's body to:

```typescript
    postLyraApi<CreatedPost[]>('/api/posts', bearerToken, {
      workspaceId: workspace_id,
      content: params.content,
      platforms: params.platforms,
      status: 'DRAFT',
      ...(params.media_urls ? { mediaUrls: params.media_urls } : {}),
    }),
```

In `src/tools/schedule-post.ts`, same shape:

```typescript
interface SchedulePostParams {
  workspace_id?: string
  content: string
  platforms: string[]
  scheduledAt: string
  media_urls?: string[]
}
```

```typescript
    postLyraApi<CreatedPost[]>('/api/posts', bearerToken, {
      workspaceId: workspace_id,
      content: params.content,
      platforms: params.platforms,
      scheduledAt: params.scheduledAt,
      status: 'SCHEDULED',
      ...(params.media_urls ? { mediaUrls: params.media_urls } : {}),
    }),
```

In `src/mcp-server.ts`, update the `draft_post` and `schedule_post` entries' `inputSchema` and `description`:

```typescript
  draft_post: {
    description: 'Create a draft post for a workspace and return its six-dimension content score. Always creates the draft regardless of score -- the score is informational. Optionally attach media via media_urls -- upload images/video first with start_media_upload / upload_media_chunk / complete_media_upload to get a URL.',
    inputSchema: z.object({
      workspace_id: z.string().optional(),
      content: z.string(),
      platforms: z.array(z.string()),
      media_urls: z.array(z.string()).optional(),
    }),
    handler: draftPost,
  },
  schedule_post: {
    description: 'Schedule a post for a workspace. Routes through the client approval workflow automatically where the workspace requires it -- the actual resulting status (SCHEDULED or PENDING_APPROVAL) is always reported truthfully, regardless of what was requested. Optionally attach media via media_urls -- upload images/video first with start_media_upload / upload_media_chunk / complete_media_upload to get a URL.',
    inputSchema: z.object({
      workspace_id: z.string().optional(),
      content: z.string(),
      platforms: z.array(z.string()),
      scheduledAt: z.string(),
      media_urls: z.array(z.string()).optional(),
    }),
    handler: schedulePost,
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/draft-post.test.ts src/tools/schedule-post.test.ts src/mcp-server.test.ts
```

Expected: PASS — every existing test in these 3 files still passes, plus the 4 new ones.

- [ ] **Step 5: Full test suite and typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/draft-post.ts src/tools/draft-post.test.ts src/tools/schedule-post.ts src/tools/schedule-post.test.ts src/mcp-server.ts
git commit -m "feat: add media_urls support to draft_post and schedule_post"
```

---

## Task 12: Update gateway docs

**Files:**
- Modify: `LYRA/lyra-mcp/README.md`

- [ ] **Step 1: Update the tool count/list**

Read the current README first (it should currently say 12 tools, from Phase 3). Update to reflect 15 tools total, adding `start_media_upload`, `upload_media_chunk`, `complete_media_upload` to whatever list/table already documents the other 12, and add a short paragraph explaining the 3-step upload protocol and that `draft_post`/`schedule_post` now accept an optional `media_urls` field populated from it.

- [ ] **Step 2: Commit**

```bash
cd LYRA/lyra-mcp
git add README.md
git commit -m "docs: document the 3 new media upload tools and media_urls support"
```

---

## Task 13: S3 bucket lifecycle rule (Richard's step)

**Not dispatched to a subagent** — this is a real AWS infrastructure change (a bucket-level policy, not application code), and per this project's established caution around infrastructure changes, needs explicit confirmation before being applied rather than being done silently.

- [ ] **Step 1: Add an `AbortIncompleteMultipartUpload` lifecycle rule** to the media bucket (the value of `AWS_S3_BUCKET`), scoped to the `media/` prefix if the bucket serves other purposes, set to abort incomplete multipart uploads after **3 days**. This can be done via the AWS S3 console (Bucket → Management → Lifecycle rules → Create rule) or the AWS CLI (`aws s3api put-bucket-lifecycle-configuration`) if credentials are available in this session — confirm with Richard before applying either way, since it's a real change to shared infrastructure.

Without this rule, an abandoned or failed upload (e.g. a client that calls `start_media_upload` and never calls `complete_media_upload`) leaves real, billable S3 storage behind indefinitely — the Redis session TTL expiring on the app side does nothing to tell S3 to clean up its half of an incomplete multipart upload.

---

## Task 14: Manual end-to-end verification (Richard's step)

**Not dispatched to a subagent** — requires a real MCP client connection and production access, matching every prior phase's final task.

- [ ] **Step 1: Redeploy**

Push triggers Railway's native auto-deploy for `lyra-mcp`, and Netlify's auto-deploy for the main app (both repos changed in this plan).

- [ ] **Step 2: Upload a real image end-to-end**

Via MCP Inspector or a real Claude Desktop session connected to the live gateway: call `start_media_upload` with a small real image, `upload_media_chunk` once (a small image should fit in a single 6MB chunk), `complete_media_upload`, then `draft_post` with the resulting URL in `media_urls`. Confirm the resulting post shows the attached image correctly in the LYRA web app.

- [ ] **Step 3: Upload a real video large enough to require multiple chunks**

Repeat with a real video file over 6MB, requiring at least 2 `upload_media_chunk` calls, to prove the multipart path genuinely works end-to-end and not just the trivial single-chunk case. Confirm the resulting post's attached video plays correctly.

This closes the feature's exit criteria from the design spec.
