# Media Presigned Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second media-attach path for the LYRA MCP gateway — `get_media_upload_url` — so a client that has rendered media locally (with no public URL yet) can upload it directly to S3 itself, without the file ever passing through an MCP tool-call argument.

**Architecture:** A new backend route generates an S3 presigned POST (URL + signed form fields with policy conditions enforcing size/content-type) and the eventual public URL. A new gateway tool returns that to the caller. The caller's own environment performs the actual upload — an HTTP POST straight to S3 — entirely outside the MCP protocol. This sits alongside the existing `attach_media` tool (unchanged), not replacing it.

**Tech Stack:** Next.js API routes (main app), TypeScript MCP gateway, `@aws-sdk/s3-presigned-post` (new dependency), zod, vitest.

---

## Task 1: Add `@aws-sdk/s3-presigned-post` dependency

**Files:**
- Modify: `LYRA/lyra/package.json`
- Modify: `LYRA/lyra/package-lock.json`

The main app already depends on `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, both at `^3.1045.0`. `@aws-sdk/s3-presigned-post` is a separate package in the same AWS SDK v3 release train (it's not bundled into either of the above) — it provides `createPresignedPost()`, which supports policy conditions (size range, exact content-type) that the existing `getSignedUrl`-based presigned-PUT helper in `lib/s3.ts` cannot express.

- [ ] **Step 1: Install the package**

```bash
cd LYRA/lyra
npm install @aws-sdk/s3-presigned-post@^3.1045.0
```

- [ ] **Step 2: Verify it installed at a compatible version**

```bash
grep '"@aws-sdk/s3-presigned-post"' package.json
```

Expected: a line showing a `^3.1045.x`-range version, matching the other two `@aws-sdk` packages' major/minor line.

- [ ] **Step 3: Confirm nothing else broke**

```bash
npx tsc --noEmit
```

Expected: clean (this step only adds a dependency, no code changes yet, so this should trivially pass).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @aws-sdk/s3-presigned-post dependency"
```

---

## Task 2: `POST /api/upload/media-presign` route (main app)

**Files:**
- Create: `LYRA/lyra/app/api/upload/media-presign/route.ts`
- Test: `LYRA/lyra/app/api/upload/media-presign/route.test.ts`

**Read the current `LYRA/lyra/app/api/upload/from-url/route.ts` and `LYRA/lyra/lib/s3.ts` in full first** — this route follows the same auth/validation/error-response conventions as `from-url`'s route (both were read when this plan was written; confirm they still match before writing code, since both may have changed since). Note the key difference from `from-url`: `contentType` here is a value the *client declares upfront* (not something discovered by fetching a response), so the MIME-allowlist check happens immediately after the required-field check, before any DB/S3 work — matching the ordering the original (now-removed) multipart `start` route used.

### Step 1: Write the failing tests

```typescript
// LYRA/lyra/app/api/upload/media-presign/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspaceAccess: { findFirst: vi.fn() } } }))
vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))
vi.mock('@/lib/authz', () => ({ canWrite: (role: string) => role !== 'CLIENT_VIEW' }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/upload/media-presign', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload/media-presign', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET', 'lyra-media-test')
    vi.stubEnv('S3_REGION', 'ap-southeast-2')
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.jpg', 'Content-Type': 'image/jpeg', Policy: 'xyz', 'X-Amz-Signature': 'sig' },
    } as never)
  })

  it('generates a presigned POST for an image with the correct size cap', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.uploadUrl).toBe('https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/')
    expect(body.fields).toEqual({ key: 'media/ws-1/abc.jpg', 'Content-Type': 'image/jpeg', Policy: 'xyz', 'X-Amz-Signature': 'sig' })
    expect(body.publicUrl).toMatch(/^https:\/\/lyra-media-test\.s3\.ap-southeast-2\.amazonaws\.com\/media\/ws-1\/.+\.jpg$/)

    const callArgs = vi.mocked(createPresignedPost).mock.calls[0][1]
    expect(callArgs.Bucket).toBe('lyra-media-test')
    expect(callArgs.Key).toMatch(/^media\/ws-1\/.+\.jpg$/)
    expect(callArgs.Expires).toBe(600)
    expect(callArgs.Fields).toEqual({ 'Content-Type': 'image/jpeg' })
    expect(callArgs.Conditions).toContainEqual(['content-length-range', 1, 50 * 1024 * 1024])
    expect(callArgs.Conditions).toContainEqual(['eq', '$Content-Type', 'image/jpeg'])
  })

  it('uses the video size cap for a video content type', async () => {
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.mp4' },
    } as never)

    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'video/mp4' }))
    expect(res.status).toBe(200)

    const callArgs = vi.mocked(createPresignedPost).mock.calls[0][1]
    expect(callArgs.Conditions).toContainEqual(['content-length-range', 1, 200 * 1024 * 1024])
  })

  it('rejects an unsupported content type without generating a presigned post', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'application/x-msdownload' }))
    expect(res.status).toBe(415)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('rejects a prototype-pollution content type ("constructor") instead of resolving Object.prototype members', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'constructor' }))
    expect(res.status).toBe(415)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('requires workspaceId', async () => {
    const res = await POST(req({ contentType: 'image/jpeg' }))
    expect(res.status).toBe(400)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('requires contentType', async () => {
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(400)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks write access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(403)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra
npx vitest run app/api/upload/media-presign/route.test.ts
```

Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra/app/api/upload/media-presign/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { s3 } from '@/lib/s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50 MB
// 200 MB, not the 25MB attach_media uses -- this route's backend involvement
// is just generating a presigned POST (near-instant), not fetching/buffering
// the actual file, so the Netlify-function-timeout constraint that caps
// attach_media's video size doesn't apply here. See the design spec
// (docs/superpowers/specs/2026-08-07-mcp-media-presigned-upload-design.md).
const MAX_VIDEO_SIZE = 200 * 1024 * 1024
// 10 minutes, longer than the web app's 5-minute presign default -- an LLM
// agent's render-then-upload loop has more inherent latency than a browser
// clicking upload immediately.
const EXPIRES_SECONDS = 600

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

    const { allowed } = await checkRateLimit(`upload-media-presign:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, contentType } = await req.json() as { workspaceId?: string; contentType?: string }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    if (!contentType) {
      return NextResponse.json({ error: 'contentType required' }, { status: 400 })
    }

    // Object.hasOwn, not a plain ALLOWED_MIME_TYPES[contentType] lookup -- a plain
    // object literal also resolves inherited Object.prototype members, so
    // contentType: "constructor" (or "__proto__", "toString", "valueOf",
    // "hasOwnProperty") would return a truthy value and sail past this check.
    const ext = Object.hasOwn(ALLOWED_MIME_TYPES, contentType) ? ALLOWED_MIME_TYPES[contentType] : undefined
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const maxSize = contentType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    const s3Key = `media/${workspaceId}/${randomUUID()}.${ext}`
    const bucket = process.env.AWS_S3_BUCKET!

    const { url: uploadUrl, fields } = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: s3Key,
      Conditions: [
        ['content-length-range', 1, maxSize],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: {
        'Content-Type': contentType,
      },
      Expires: EXPIRES_SECONDS,
    })

    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`

    return NextResponse.json({ uploadUrl, fields, publicUrl })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/media-presign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

If the real current `lib/s3.ts` doesn't export `s3` (the `S3Client` instance) under that exact name, or `from-url/route.ts`'s real current auth/validation pattern differs from what's shown above, match the real current files rather than this snippet verbatim.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run app/api/upload/media-presign/route.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/upload/media-presign/route.ts app/api/upload/media-presign/route.test.ts
git commit -m "feat: add POST /api/upload/media-presign route"
```

---

## Task 3: `get_media_upload_url` gateway tool

**Files:**
- Create: `LYRA/lyra-mcp/src/tools/get-media-upload-url.ts`
- Test: `LYRA/lyra-mcp/src/tools/get-media-upload-url.test.ts`

**Read `LYRA/lyra-mcp/src/tools/attach-media.ts` and its test file in full first** — this tool follows that exact structural pattern (resolve workspace, thin wrapper around `postLyraApi`, no try/catch, errors propagate unchanged). Confirm the real current file still matches before writing code.

### Step 1: Write the failing tests

```typescript
// LYRA/lyra-mcp/src/tools/get-media-upload-url.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getMediaUploadUrl } from './get-media-upload-url'

describe('getMediaUploadUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('resolves the workspace and forwards to the backend media-presign route', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({
      uploadUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.mp4', 'Content-Type': 'video/mp4' },
      publicUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/abc.mp4',
    })

    const result = await getMediaUploadUrl({ workspace_id: 'ws-1', contentType: 'video/mp4' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/media-presign', 'token-abc', {
      workspaceId: 'ws-1',
      contentType: 'video/mp4',
    })
    expect(result).toEqual({
      uploadUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.mp4', 'Content-Type': 'video/mp4' },
      publicUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/abc.mp4',
    })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({
      uploadUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/',
      fields: {},
      publicUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/abc.jpg',
    })

    await getMediaUploadUrl({ contentType: 'image/jpeg' }, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/media-presign', 'token-abc', expect.objectContaining({ workspaceId: 'ws-1' }))
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(415, { error: 'File type not permitted' }))

    await expect(
      getMediaUploadUrl({ workspace_id: 'ws-1', contentType: 'application/x-msdownload' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd LYRA/lyra-mcp
npx vitest run src/tools/get-media-upload-url.test.ts
```

Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// LYRA/lyra-mcp/src/tools/get-media-upload-url.ts
import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface GetMediaUploadUrlParams {
  workspace_id?: string
  contentType: string
}

interface GetMediaUploadUrlResult {
  uploadUrl: string
  fields: Record<string, string>
  publicUrl: string
}

export async function getMediaUploadUrl(params: GetMediaUploadUrlParams, bearerToken: string): Promise<GetMediaUploadUrlResult> {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  return postLyraApi<GetMediaUploadUrlResult>('/api/upload/media-presign', bearerToken, {
    workspaceId: workspace_id,
    contentType: params.contentType,
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/tools/get-media-upload-url.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/get-media-upload-url.ts src/tools/get-media-upload-url.test.ts
git commit -m "feat: add get_media_upload_url gateway tool"
```

---

## Task 4: Register `get_media_upload_url`, update README

**Files:**
- Modify: `LYRA/lyra-mcp/src/mcp-server.ts`
- Modify: `LYRA/lyra-mcp/src/mcp-server.test.ts`
- Modify: `LYRA/lyra-mcp/README.md`

**Read the current `mcp-server.ts`, `mcp-server.test.ts`, and `README.md` in full first** — confirm the exact current shape (tool count, `TOOL_REGISTRY` key order, `NO_WORKSPACE_RESOLUTION_TOOLS` contents) before editing.

- [ ] **Step 1: Update the failing test**

Change the tool-count test to expect 14 tools, adding `'get_media_upload_url'` to the sorted array:

```typescript
  it('registers exactly the 14 core tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'attach_media',
      'call_capability',
      'draft_post',
      'get_analytics',
      'get_brand_profile',
      'get_media_upload_url',
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

Expected: FAIL — only 13 tools currently registered.

- [ ] **Step 3: Modify `mcp-server.ts`**

Add the import, alongside the existing tool imports:

```typescript
import { getMediaUploadUrl } from './tools/get-media-upload-url'
```

Add one entry to `TOOL_REGISTRY`, after the existing `attach_media` entry:

```typescript
  get_media_upload_url: {
    description: 'Get a URL to upload media you\'ve created yourself (e.g. rendered locally in your own code-execution environment) directly to LYRA\'s storage -- for media that is NOT already hosted anywhere. Returns uploadUrl, fields, and publicUrl. You must then perform the actual upload yourself: an HTTP POST directly to uploadUrl, as a multipart/form-data request containing every key in fields plus the file itself under the field name "file". Only once that POST succeeds does publicUrl become a real, usable link -- pass it into draft_post\'s or schedule_post\'s media_urls. If your media is already hosted somewhere (e.g. output from a generation tool that returns a URL), use attach_media instead -- it\'s a single call with no separate upload step. Images up to 50MB, video up to 200MB.',
    inputSchema: z.object({ workspace_id: z.string().optional(), contentType: z.string() }),
    handler: getMediaUploadUrl,
  },
```

Do NOT add `'get_media_upload_url'` to `NO_WORKSPACE_RESOLUTION_TOOLS` — this tool needs workspace resolution, unlike `list_workspaces`.

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

Expected: both clean.

- [ ] **Step 6: Update `README.md`**

Update the tool count from "13 core tools (7 read, 4 write, 2 capability-discovery)" to "14 core tools (7 read, 5 write, 2 capability-discovery)". Add `get_media_upload_url` to the write-tools group in the `**Tools:**` list. Add a short paragraph after the existing "Media uploads" paragraph explaining this second path:

```markdown
For media that isn't hosted anywhere yet -- e.g. rendered locally by the calling client itself -- use `get_media_upload_url` instead: it returns an `uploadUrl` and `fields` for a direct S3 upload (a multipart/form-data POST the client performs itself, outside the MCP protocol), plus the resulting `publicUrl` to use once that upload succeeds. Images up to 50MB, video up to 200MB (larger than `attach_media`'s cap, since this path doesn't require the backend to fetch/buffer the file itself).
```

Update the second tool-count mention ("beyond the 13 core tools") to "beyond the 14 core tools".

- [ ] **Step 7: Commit**

```bash
git add src/mcp-server.ts src/mcp-server.test.ts README.md
git commit -m "feat: register get_media_upload_url, update gateway README"
```

---

## Manual end-to-end verification (Richard's step, not dispatched to a subagent)

After all 4 tasks are done and reviewed: push to origin, wait for both deploys, then have a real MCP client (e.g. Claude Desktop) render a small file locally, call `get_media_upload_url`, perform the actual multipart POST itself using the returned `uploadUrl`/`fields`, and confirm the resulting `publicUrl` renders correctly on a real post. This is the exact scenario that failed in production earlier — it's the right acceptance test.
