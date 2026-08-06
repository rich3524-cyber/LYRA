# LYRA MCP Gateway — Media Upload Design

**Status:** Approved by Richard, ready for planning
**Author:** Claude Code, with Richard Unwin
**Date:** 2026-08-06

## Overview

The LYRA MCP gateway (`LYRA/lyra-mcp`, live at `mcp.lyraonline.ai`) lets an LLM client (e.g. Claude Desktop) manage a LYRA workspace — draft and schedule posts, respond to inbox items, and reach 16 additional capabilities through `call_capability`. A real-world test surfaced a concrete gap: `draft_post`/`schedule_post` have no way to attach an image or video. Some platforms (TikTok in particular) actively reject a scheduling request that has no media attached, so this isn't a nice-to-have — a meaningful share of realistic posting requests can't complete without it.

This phase adds media (image and video) upload support to the gateway, so an LLM can attach generated or provided artwork to a post before drafting or scheduling it.

**Exit criteria:** a real image and a real video (large enough to require multiple upload chunks) can both be uploaded through the gateway's new tools and successfully attached to a real scheduled post, verified live.

**Out of scope for this phase** (explicitly deferred, not forgotten):
- Per-platform media overrides (`platformMedia` — different media per platform on the same post). The backend already supports this; this phase only wires through the shared `mediaUrls` path. Adding per-platform overrides later is a pure schema addition, not a redesign.
- Enforcing platform-specific media rules (e.g. "TikTok accepts exactly one video"). This isn't enforced anywhere in LYRA's own code today, on the web app or the gateway — a violation surfaces later as a downstream publish failure via Zernio. This phase inherits that pre-existing gap rather than fixing it.
- An S3 bucket lifecycle rule to auto-abort abandoned multipart uploads. This is an AWS infrastructure change outside the codebase, needed before this phase can be considered fully safe to leave running unattended — tracked as a required manual step in the plan, not app code.

## Grounding: current media architecture (as of this design)

Researched directly against the real code, not assumed:

- The web app's Compose UI uploads via a **presigned-URL, direct-to-browser-to-S3** flow: the client requests a presigned `PUT` URL from `POST /api/upload/presign`, then `PUT`s raw file bytes straight to S3 from the browser. This doesn't translate to an MCP client — an LLM tool call can't casually perform an arbitrary authenticated `PUT` to S3 as a side effect.
- `POST /api/upload/presign` (`LYRA/lyra/app/api/upload/presign/route.ts`): requires `requireAuth()` + workspace `canWrite()` role, validates `contentType` against an allowlist (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`), enforces a 50MB size limit, rate-limited 30/60s per user. Generates an S3 key `media/{workspaceId}/{uuid}.{ext}` and a 5-minute presigned `PutObjectCommand` URL via `lib/s3.ts`.
- `Post.mediaUrls` (`prisma/schema.prisma`) is a flat `String[]` of plain public S3 URLs — no per-item metadata. Each `Post` row belongs to exactly one platform account; "per-platform media" is a Compose-UI-only construct that gets flattened into each platform's own `Post.mediaUrls` at creation time via `platformMedia?.[account.platform]?.length ? platformMedia[account.platform] : mediaUrls`.
- `POST /api/posts` (`app/api/posts/route.ts`) — the route both the web app's Compose UI and the gateway's `draft_post`/`schedule_post` already call — **already accepts `mediaUrls: z.array(z.string()).optional()` and `platformMedia` in its request schema**. The gateway's tool handlers (`lyra-mcp/src/tools/draft-post.ts`, `schedule-post.ts`) simply don't send either field today. No backend change is needed to *attach* media to a post — only to *get* media into S3 in the first place, and to extend the gateway's own tool schemas to pass a URL through.
- Real, server-enforced media validation in LYRA today is narrow: an Instagram/Threads image-format allowlist (`services/social/media-compatibility.ts`, jpg/png only, GIF/WebP rejected) and a `requiresMedia` flag check (both only enforced at `status === 'SCHEDULED'`, not for drafts). Platform-specific rules like "TikTok wants exactly one video" exist only as UI hint text (`platform-media-tabs.tsx`) — not validated anywhere, client or server. Real per-platform violations surface downstream as a Zernio publish failure.
- S3 config: bucket name in `AWS_S3_BUCKET` (`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_REGION` also set — deliberately not the `AWS_*`-prefixed names, since Netlify Functions run on Lambda and reserve those for the zero-permission execution role). Public URL shape: `https://{bucket}.s3.{region}.amazonaws.com/{key}` — plain, unsigned, since Zernio and native publish providers fetch it directly and the web app renders it directly in `<Image>`. Bucket CORS and public-read policy already exist outside this repo (AWS console/IaC), configured during earlier work.

## Architecture

Following this project's established pattern across every prior phase: **the gateway never talks to AWS or the database directly.** It always proxies through the main LYRA app's REST API. This phase touches both repos — new backend routes in `LYRA/lyra` doing the real S3 work, and new MCP tools in `LYRA/lyra-mcp` that are thin proxies over them, same shape as every existing tool.

### The upload protocol: always chunked, regardless of size

A single base64-encoded tool-call payload doesn't scale to video (a 50MB file becomes ~67MB of base64 text — impractical over typical MCP transport). The fix is a real S3 Multipart Upload, chunked from the client side:

1. **`start_media_upload`** — declares intent, opens an S3 multipart session, returns an upload id and the chunk size to use.
2. **`upload_media_chunk`** — called once per chunk (base64-encoded bytes), forwarded to S3 as a real multipart "part." S3 tracks parts by number, not arrival order, so chunks may arrive out of sequence.
3. **`complete_media_upload`** — once all expected parts have arrived, finalizes the S3 upload and returns the real public URL.

**Deliberately one protocol for both images and video** rather than a simple path for small files and a chunked path for large ones: a 2MB image just happens to complete in a single chunk. This means an LLM client only ever needs to learn one upload pattern, which matters for tool-selection reliability — the same lesson this project's tool-selection eval already surfaced for `call_capability` (a single consistent interface beats multiple similar-but-different ones).

The resulting URL is then passed into a new optional field on the existing `draft_post`/`schedule_post` tools — an explicit two-step flow (upload, then attach), matching how the web app itself already works, and letting an LLM upload several images before deciding how to use them.

## Component 1: New backend routes (`LYRA/lyra`)

Three new routes under `app/api/upload/multipart/`, mirroring `/api/upload/presign`'s existing auth/validation conventions (`requireAuth()`, workspace `canWrite()` role check, the same MIME allowlist):

### `POST /api/upload/multipart/start`

Request: `{ workspaceId: string, filename: string, contentType: string, totalSizeBytes: number }`

- Validates `contentType` against the allowlist (same 7 MIME types as the existing presign route).
- Validates `totalSizeBytes`: 50MB max for image/* content types, 200MB max for video/* content types.
- Verifies `WorkspaceAccess` + `canWrite(role)`, same as `/api/upload/presign`.
- Generates the S3 key `media/{workspaceId}/{uuid}.{ext}` (same convention the existing presign route uses).
- Calls S3 `CreateMultipartUpload`, gets back a real `UploadId`.
- Computes a `chunkSizeBytes` for the client to use — a fixed 6MB (comfortably above S3's 5MB-minimum-per-part rule for all but the final part, and small enough that base64 inflation, ~8MB per chunk, stays well under typical request-body limits).
- Stores session state in Redis, keyed by a gateway-facing `uploadId` (a fresh UUID, not S3's own `UploadId` — see below): `{ s3Key, s3UploadId, workspaceId, userId, contentType, totalSizeBytes, chunkSizeBytes, expectedParts, receivedParts: {} }`, TTL 24 hours.
- Rate-limited, same convention as `/api/upload/presign` (30/60s per user is a reasonable starting point — reused, not reinvented).

Response: `{ uploadId: string, chunkSizeBytes: number }`

### `PUT /api/upload/multipart/part`

Request: `{ uploadId: string, chunkIndex: number, data: string }` (`data` is base64)

- Looks up the Redis session by `uploadId`. 404 if not found or expired.
- Verifies the calling user/workspace matches the session's stored owner — a guessed or stray `uploadId` from a different session is rejected, not silently accepted.
- Decodes `data`, calls S3 `UploadPart` with the session's real `s3UploadId`, `chunkIndex + 1` as the S3 part number (S3 part numbers are 1-indexed).
- Stores the returned `ETag` against `receivedParts[chunkIndex]` in the Redis session.

Response: `{ received: true, chunkIndex: number }`

### `POST /api/upload/multipart/complete`

Request: `{ uploadId: string }`

- Looks up the Redis session. Verifies ownership, same as the part route.
- Checks `receivedParts` covers every expected chunk index (derivable from `totalSizeBytes` / `chunkSizeBytes`). If any are missing, returns a 422 naming the missing chunk indices explicitly — not a generic S3 failure.
- Calls S3 `CompleteMultipartUpload` with the full ordered list of `{ PartNumber, ETag }`.
- Constructs the public URL: `https://{bucket}.s3.{region}.amazonaws.com/{s3Key}` (same shape the presign flow already produces).
- Deletes the Redis session.

Response: `{ url: string }`

## Component 2: New gateway tools (`LYRA/lyra-mcp`)

Three new entries in `TOOL_REGISTRY` (`src/mcp-server.ts`), each a thin proxy — no logic beyond forwarding to the corresponding backend route via `postLyraApi`/`callLyraApi`. Following the existing pattern, `workspace_id` is optional on all three and resolved via the same `resolveWorkspaceId` every other tool already uses.

```typescript
start_media_upload: {
  description: 'Start uploading an image or video to attach to a post. Returns an uploadId and chunkSizeBytes -- call upload_media_chunk repeatedly with base64-encoded chunks of that size, then complete_media_upload to get the final URL. Use the same protocol for images and video; a small image just completes in a single chunk.',
  inputSchema: z.object({ workspace_id: z.string().optional(), filename: z.string(), contentType: z.string(), totalSizeBytes: z.number().int().positive() }),
  handler: startMediaUpload,
},
upload_media_chunk: {
  description: 'Upload one chunk of a file previously started with start_media_upload. Call once per chunk of chunkSizeBytes (the last chunk may be smaller). Chunks may be sent in any order.',
  inputSchema: z.object({ uploadId: z.string(), chunkIndex: z.number().int().nonnegative(), data: z.string() }),
  handler: uploadMediaChunk,
},
complete_media_upload: {
  description: 'Finish an upload once all chunks from upload_media_chunk have been sent. Returns the real URL -- pass it into draft_post or schedule_post\'s media_urls to attach it to a post.',
  inputSchema: z.object({ uploadId: z.string() }),
  handler: completeMediaUpload,
},
```

Each new tool's handler (`src/tools/start-media-upload.ts`, `upload-media-chunk.ts`, `complete-media-upload.ts`) follows the exact structure of the existing `draft-post.ts`/`schedule-post.ts` handlers: resolve workspace, call the backend route, return its response.

## Component 3: `draft_post` / `schedule_post` schema extension

Both gain one new optional field:

```typescript
media_urls: z.array(z.string()).optional()
```

Threaded straight through to the existing `POST /api/posts` call as `mediaUrls` — the backend already accepts this field, so this is purely a gateway-side schema and handler change, not a backend change.

Both tool descriptions are updated to mention the new field and point at the upload tools, e.g. appending to `draft_post`'s existing description: *"Optionally attach media via media_urls — upload images/video first with start_media_upload / upload_media_chunk / complete_media_upload to get a URL."* This mirrors the lesson from this project's tool-selection eval work: an LLM only reliably uses a multi-step protocol correctly if the tool description actually says to.

`respond_to_item` is untouched — comment/review replies don't carry media.

## Validation & error handling

- **Size caps**: 50MB for `image/*` content types, 200MB for `video/*` — enforced in `start_media_upload`'s backend route, before any S3 session is opened.
- **MIME allowlist**: the same 7 types the existing presign route already enforces (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`). Anything else is rejected at `start_media_upload`.
- **Session ownership**: every `upload_media_chunk`/`complete_media_upload` call verifies the caller's workspace/user matches the session that `start_media_upload` created. A stray or guessed `uploadId` is rejected.
- **Incomplete uploads at completion time**: `complete_media_upload` returns a 422 naming exactly which chunk indices are missing, rather than surfacing a generic S3 error.
- **Abandoned sessions**: the Redis session TTL (24 hours) means an abandoned `uploadId` simply stops resolving after that window. This does **not** by itself stop S3 from billing for the orphaned uploaded parts — see the required manual step below.
- **Known, pre-existing weak spot this phase inherits, not introduces**: platform-specific media rules (single-video-only on TikTok, etc.) aren't enforced anywhere in LYRA's own code today, on the web app or here. A violation surfaces later as a downstream Zernio publish failure, not a clean upfront error from this phase's tools. Fixing that is a separate, larger piece of work (would mean encoding real per-platform media rules somewhere they're actually checked) and is explicitly out of scope for this phase.

## Required manual step (infrastructure, outside the codebase)

An S3 bucket lifecycle rule — `AbortIncompleteMultipartUpload` after a few days — needs to be configured on the media bucket in the AWS console (or via IaC, if the project ever adopts it) before this phase should be considered safe to leave running unattended. Without it, an abandoned or failed upload leaves real, billable S3 storage behind indefinitely, since the gateway/main-app Redis session expiring doesn't tell S3 to clean up its side. This is the same category of external, outside-the-repo AWS configuration the existing bucket CORS and public-read policies already required. Attempting this via AWS CLI/API is possible during implementation if credentials are available, but as a real infrastructure change it needs explicit confirmation before being applied, not silent action.

## Testing & rollout

Standard TDD per component, matching every prior phase:
- Unit tests for each of the 3 new backend routes, mocking the AWS S3 SDK calls (`CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`) and Redis.
- Unit tests for each of the 3 new gateway tools, mocking the backend HTTP calls.
- Updated tests for `draft_post`/`schedule_post` covering the new `media_urls` field being threaded through correctly.

Final manual verification (matching the precedent from every prior phase's last task): upload a real small image through the full protocol via MCP Inspector or a real Claude Desktop session, confirm it attaches to a real post correctly; then repeat with a real video large enough to require at least 2 chunks, to prove the multipart path genuinely works end-to-end, not just the trivial single-chunk case.

No new OAuth scopes needed beyond what already exists — media upload carries the same `content:write` scope already used by `draft_post`, under this project's existing (and separately, deliberately, documented-as-not-yet-enforced) scope declaration convention from Phase 3.

## Self-Review

- **Placeholder scan**: no TBD/TODO markers; every requirement above is concrete.
- **Internal consistency**: the "always chunked, even for 1 chunk" decision is stated once in Architecture and referenced consistently in Component 2's tool descriptions — no contradiction with a "simple path for images" idea that was considered and explicitly rejected during design.
- **Scope check**: focused enough for a single implementation plan. The explicitly out-of-scope items (per-platform overrides, platform-rule enforcement, the S3 lifecycle rule as *app* work) are named, not silently absorbed.
- **Ambiguity check**: chunk size is fixed by the backend (6MB) rather than left to client choice, removing a class of "what size should I send" ambiguity. Part numbering (`chunkIndex + 1` for S3's 1-indexed parts) is stated explicitly rather than left implicit.
