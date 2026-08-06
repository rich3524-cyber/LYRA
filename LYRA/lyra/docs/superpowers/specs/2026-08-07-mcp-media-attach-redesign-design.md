# Media Attach Redesign — Design Spec

## Background

A prior phase (spec: `2026-08-06-mcp-media-upload-design.md`) built a full chunked S3 multipart upload system so an MCP client could upload image/video bytes and attach them to a LYRA post: 3 gateway tools (`start_media_upload`, `upload_media_chunk`, `complete_media_upload`) relaying base64-encoded chunks through MCP tool calls to 3 new backend routes, backed by Redis session state.

Every individual task was implemented via TDD and passed its own spec-compliance and code-quality review. A final holistic review — looking at the feature as a whole, across file and repo boundaries, after every individual piece had already been approved — found it doesn't work:

1. **Gateway transport limit**: `express.json()` in `lyra-mcp/src/http.ts` has no size override, defaulting to 100KB. A single 6MB chunk (the size the backend itself required) base64-encodes to ~8.4MB — Express rejects it before any application code runs. No chunk over ~75KB could ever be sent.
2. **Backend transport limit**: the main app's API routes run as Netlify Functions (Lambda), which cap request bodies around 6MB. S3 requires every non-final multipart part to be ≥5MB, which base64-encodes to ~6.7MB — already over the cap. No multi-chunk upload could succeed through this transport at any chunk size.
3. **Protocol/LLM mismatch**: even ignoring 1 and 2, the protocol required the calling LLM to emit the base64 chunk data as a literal tool-call argument. A 6MB chunk is ~2 million tokens — no model can generate that. Only a non-LLM-mediated, programmatic client could ever have driven this protocol, and even that client would hit finding 2.

The actual motivating use case (confirmed with Richard): Claude Desktop generates captions and artwork via an image/video generation tool, then attaches that generated media to a LYRA post. Generation tools return a **URL** to the generated asset, not raw bytes the LLM holds directly. The chunked-upload design solved a problem the real use case doesn't have, while failing to solve the problem it does have.

This spec replaces the chunked multipart system with a single URL-based attach flow.

## Architecture

One new gateway tool, `attach_media(source_url, workspace_id?)`, calls one new backend route, `POST /api/upload/from-url`, which fetches `source_url` server-side and uploads the result directly to S3 in one synchronous request/response cycle, returning the final public URL.

This replaces the entire chunked system: 3 gateway tools + 3 backend routes + a Redis session-state module collapse into 1 tool + 1 route, no chunking, no session state, no async job/polling. All previously-built chunked-multipart infrastructure is removed, not deprecated — no realistic client (LLM-mediated or otherwise, given the Netlify payload cap) can drive it.

## Backend route: `POST /api/upload/from-url`

Mirrors the removed `start` route's auth/validation shape where applicable:

1. `requireAuth()` → rate limit.
2. Require `workspaceId` and `sourceUrl` in the body (400 if either missing).
3. `WorkspaceAccess` + `canWrite` check (403 if not authorized) — same pattern as the old `start` route.
4. **SSRF protection**: validate `sourceUrl` via the existing `assertSafeUrl()`/`safeFetch()` in `lib/safe-fetch.ts` — already used by 7 other call sites in this codebase (brand-intelligence scraper, competitor scraper, content-repurposer, on-page-analyzer, email-marketing services). It enforces https-only, resolves DNS and blocks private/reserved/loopback IP ranges, and re-validates on each redirect hop. No new SSRF code needed; no domain allowlist beyond this (per design decision — covers the real threat without hardcoding specific providers).
5. Fetch with a timeout (`AbortSignal.timeout(15_000)` or similar) via `safeFetch`.
6. Validate the response's actual `Content-Type` against a MIME allowlist (jpeg/png/gif/webp/mp4/mov/webm — the same set the old `start` route used), via `Object.hasOwn()` (not a plain object-literal lookup — the prototype-pollution class of bug found and fixed during the prior phase must not be reintroduced here).
7. Enforce size caps while reading the response body — not just trusting `Content-Length` (a malicious/misconfigured server could lie): **images up to 50MB** (unchanged from the prior design), **video capped at 25MB** (new — see rationale below). Abort and 413 if the actual byte count exceeds the applicable cap, regardless of what any header claimed.
8. Upload the buffered bytes via the existing `putObjectBuffer()` in `lib/s3.ts` (already present, no multipart machinery needed) to `media/{workspaceId}/{randomUUID()}.{ext}` — same key shape the old `start` route used.
9. Return `{url}`.

**Video size cap rationale**: this route must complete fetch + upload inside a single Netlify Function invocation, which has an execution time limit (historically ~10s default, ~26s hard cap even on paid plans, unconfigured in this codebase per `netlify.toml`/`next.config.ts`). The original chunked design targeted 200MB video; that's incompatible with a single synchronous call under conservative throughput assumptions. 25MB is enough for a short clip and leaves comfortable headroom under the timeout even with pessimistic fetch+upload throughput. If longer/larger video support is needed later, that's a new phase built on the existing BullMQ + Railway worker infrastructure (`lib/queues.ts`, `workers/`), not a synchronous route — deliberately out of scope here (YAGNI; build it if and when it's actually needed).

### Error handling

| Condition | Status |
|---|---|
| Missing `workspaceId`/`sourceUrl` | 400 |
| `sourceUrl` fails SSRF check (private IP, non-https) | 400 |
| No write access to workspace | 403 |
| Content-Type not in allowlist | 415 |
| Response exceeds size cap | 413 |
| Fetch times out | 504 |
| Fetch fails (network error, non-2xx) | 502 |
| Unauthenticated | 401 |
| Rate limited | 429 |

No S3-orphan cleanup path is needed here (unlike the removed multipart `complete` route) — a single `PutObject` either fully succeeds or fully fails; there's no partial-upload state to abort.

## Gateway tool: `attach_media`

- Params: `{workspace_id?: string, source_url: string}`.
- Resolves `workspace_id` via `resolveWorkspaceId` (this tool needs workspace resolution, unlike the removed `upload_media_chunk`/`complete_media_upload`, which deliberately skipped it) — no entry in `NO_WORKSPACE_RESOLUTION_TOOLS` for this tool.
- Calls `postLyraApi('/api/upload/from-url', bearerToken, {workspaceId, sourceUrl: params.source_url})`.
- Returns `{url: string}` directly — no wrapping, errors propagate unchanged (matching the established thin-wrapper pattern from every other tool in this codebase).
- Tool description makes clear this is for attaching media generated or hosted elsewhere (e.g. by an image/video generation tool that returned a URL) — not for uploading raw local bytes the client holds directly.

`draft_post`/`schedule_post`'s descriptions in `mcp-server.ts` are updated to reference `attach_media` in place of the old 3-tool chain.

## Removal scope

**Main app (`LYRA/lyra`) — delete:**
- `lib/upload-session.ts` + `lib/upload-session.test.ts`
- `app/api/upload/multipart/start/route.ts` + test
- `app/api/upload/multipart/part/route.ts` + test
- `app/api/upload/multipart/complete/route.ts` + test
- From `lib/s3.ts`: `createMultipartUpload`, `uploadPart`, `completeMultipartUpload`, `abortMultipartUpload` and their tests in `lib/s3.test.ts` (keep every other export — `getUploadPresignedUrl`, `deleteObject`, `headObjectLastModified`, `getObjectBuffer`, `putObjectBuffer` are all still used elsewhere and by the new route)

**Gateway (`LYRA/lyra-mcp`) — delete:**
- `src/tools/start-media-upload.ts`, `upload-media-chunk.ts`, `complete-media-upload.ts` + their tests
- The 3 corresponding `TOOL_REGISTRY` entries and imports in `mcp-server.ts`
- The `upload_media_chunk`/`complete_media_upload` entries in `NO_WORKSPACE_RESOLUTION_TOOLS` (keep `list_workspaces`' own exclusion — unrelated to this feature)
- `putLyraApi` in `src/lyra-api-client.ts` + its tests — nothing will call PUT once these tools are gone (YAGNI; trivial to re-add later mirroring `postLyraApi` if ever needed)

**README (`LYRA/lyra-mcp/README.md`)**: replace the "Media uploads" section with the new single-tool flow description; update the tool count from 15 to 13 (15 − 3 removed + 1 added: `attach_media`).

**Task 13 from the prior plan (S3 bucket lifecycle rule for abandoned incomplete multipart uploads) is dropped entirely** — there's no multipart upload left to abandon.

## Testing & rollout

- Same TDD + subagent-driven-development process as the prior phase: implementer → spec-compliance review → code-quality review → fix loops, task by task.
- Backend route tests: mock `safeFetch`, cover every error path in the table above plus the happy path with a small fixture buffer for both an image and a video content-type.
- Gateway tool tests: mirror the existing thin-wrapper test pattern already established by the tools being removed (forwards params correctly, propagates errors unchanged).
- Manual end-to-end verification (replacing the old Task 14): a real image URL and a real short-video URL through `attach_media` via a live MCP client, confirming the resulting post shows the attached media correctly in the LYRA web app. This remains Richard's manual step, not dispatched to a subagent.
- No new infrastructure to provision.
