# Media Presigned Upload — Design Spec

## Background

The media-attach redesign shipped earlier this session (`2026-08-07-mcp-media-attach-redesign-design.md`) added `attach_media(source_url, workspace_id?)` — a tool that fetches an already-hosted URL server-side and re-hosts it on S3. This works well for media produced by hosted/server-side generation APIs (e.g. Higgsfield's `generate_video`, which returns a real public URL).

Real-world testing the same day found a gap: Claude Desktop rendered a set of on-brand motion-graphics videos itself, via its own code-execution sandbox (a custom render for precise brand-guideline compliance — exact hex colors, exact easing curves, exact typography — beyond what a generic hosted generation API could match). The resulting MP4s only ever existed inside that sandbox. There was no public URL for `attach_media` to fetch, so five scheduled posts ended up with captions but no media. The gap was caught before anything published (posts sat in `PENDING_APPROVAL`) and the user canceled that day's post.

Root cause: MCP tool-call arguments are text/JSON authored by the calling LLM's own token generation. There is no way to relay a multi-megabyte video through that channel — this is the exact reason the original chunked-multipart-upload design (built, reviewed, then fully removed earlier this session) never actually worked. A model cannot emit millions of tokens of base64 as a tool argument, regardless of chunking.

We tested whether Claude Desktop's code-execution sandbox has outbound network access: confirmed yes (successful `urllib`/`curl` requests, DNS resolution, and an outbound POST to `httpbin.org`). It does not have inbound access — no public IP, no web server, ephemeral filesystem — which is exactly why `attach_media`'s fetch-based approach can never reach into it.

The insight this spec builds on: a presigned S3 upload requires only outbound access from the uploading client. It pushes bytes to a URL it already has write permission for; nothing needs to reach back into the sandbox. This is a genuinely different mechanism from `attach_media`, not a revival of chunking — the byte transfer happens entirely outside the MCP protocol, via the client's own outbound HTTP capability.

## Architecture

One new backend route generates an S3 presigned POST (a URL plus a set of signed form fields, with policy conditions enforcing size and content-type) and the eventual public URL. One new gateway tool, `get_media_upload_url(workspace_id?, contentType)`, calls it and returns `{uploadUrl, fields, publicUrl}`. The calling client's own environment then performs a multipart form POST directly to S3 using `uploadUrl` + `fields` + the raw file bytes — this never touches the MCP protocol or the LLM's token stream. Once that POST succeeds, `publicUrl` is immediately valid to pass into `draft_post`/`schedule_post`'s existing `media_urls` field.

This is a second, complementary path alongside `attach_media`, which is unchanged and remains the right tool when media is already hosted somewhere (e.g. a generation API's own output URL). `get_media_upload_url` is for the case `attach_media` cannot serve: media that only exists on the calling client's own side, with no public URL yet.

## Backend route: `POST /api/upload/media-presign`

1. `requireAuth()` → rate limit.
2. Require `workspaceId` and `contentType` in the body (400 if either missing).
3. `Object.hasOwn`-guarded MIME allowlist check — the same 7-type list used by `attach_media` and the removed multipart `start` route (jpeg/png/gif/webp/mp4/mov/webm) — 415 if not present. Same prototype-pollution-safe lookup pattern established earlier this session; do not regress to a plain object-literal lookup.
4. `WorkspaceAccess` + `canWrite` check (403 if not authorized) — same pattern as every other write route this session.
5. Generate `s3Key = media/{workspaceId}/{randomUUID()}.{ext}` — same key shape used by `attach_media` and the removed `start` route.
6. Determine the size cap: **50MB for images, 200MB for video** (not the 25MB video cap `attach_media` uses — that cap existed specifically because that route has to fetch and upload inside a single Netlify Function invocation; this route's backend involvement is just generating a presigned POST, which is near-instant, so the old timeout-driven constraint doesn't apply here. 200MB restores the original target from before any Netlify-timeout constraint existed, and comfortably covers real social video — TikTok's own cap is around 287MB, Reels/Stories are much smaller).
7. Call `createPresignedPost()` from `@aws-sdk/s3-presigned-post` (a new dependency — not yet used in this codebase; the existing `@aws-sdk/s3-request-presigner` only handles presigned GET/PUT via `getSignedUrl`, not POST-with-policy-conditions) with:
   - `Bucket`/`Key` = the bucket env var / `s3Key`.
   - `Conditions`: exact `Content-Type` match (the declared `contentType`), `content-length-range: [1, maxSize]`.
   - `Fields`: `{ 'Content-Type': contentType }`.
   - `Expires`: 600 seconds (10 minutes — longer than the web app's existing 5-minute presign default, since an LLM agent's loop (render, call tool, then get around to uploading) has more inherent latency than a browser clicking upload immediately).
8. Return `{uploadUrl, fields, publicUrl}` — `uploadUrl` and `fields` come directly from `createPresignedPost`'s result (`url` and `fields` respectively); `publicUrl` is `https://{bucket}.s3.{region}.amazonaws.com/{s3Key}`, the same shape used by every other route this session.

No S3-side cleanup concern: if the client never uploads, nothing was ever created (unlike the removed multipart design's orphaned-upload problem — a presigned POST that's never used simply expires with no S3-side artifact).

### Error handling

| Condition | Status |
|---|---|
| Missing `workspaceId`/`contentType` | 400 |
| Content-Type not in allowlist | 415 |
| No write access to workspace | 403 |
| Unauthenticated | 401 |
| Rate limited | 429 |
| Unexpected error | 500 |

## Gateway tool: `get_media_upload_url`

- Params: `{workspace_id?: string, contentType: string}`.
- Resolves `workspace_id` via `resolveWorkspaceId` (this tool needs workspace resolution, like `attach_media` — not one of the audit-exempt tools).
- Calls `postLyraApi('/api/upload/media-presign', bearerToken, {workspaceId, contentType})`.
- Returns `{uploadUrl, fields, publicUrl}` directly — no wrapping, errors propagate unchanged (the established thin-wrapper pattern).
- **Tool description must spell out the client's own responsibility explicitly.** Unlike every other tool in this gateway (where the tool call itself completes the whole action), this tool only gets the caller *ready* to upload — the actual file transfer is something the calling client must do itself, outside the MCP protocol, using its own HTTP capability (e.g. a code-execution environment's own outbound network access). A model that doesn't realize this might call the tool, get the URL back, and then not know what to do with it. The description should say plainly: this returns an upload URL and required form fields; you (the calling client) must perform an HTTP POST directly to `uploadUrl`, as a multipart form request including every field in `fields` plus the file itself under the field name `file`, before `publicUrl` becomes a real, usable URL. Only after that POST succeeds should `publicUrl` be passed into `draft_post`'s or `schedule_post`'s `media_urls`.

No audit/confirmation step: `get_media_upload_url`'s own call is already audit-logged (workspace, tool name, params) via the existing `createToolCallback` wrapper — that's a reasonable audit trail ("this user requested an upload URL for this workspace at this time"). A second round-trip purely to confirm upload success was considered and deliberately left out — `draft_post`/`schedule_post`'s own audit log captures the resulting `media_urls` moments later regardless.

## Testing & rollout

- Same TDD + subagent-driven-development process as every prior task this session: implementer → spec-compliance review → code-quality review → fix loops.
- Backend route tests: mock `createPresignedPost`, cover every error path in the table above, and confirm the exact `Conditions`/`Fields`/`Expires` passed to it are correct (right `content-length-range` for image vs video content-types, right `Content-Type` condition, right 600-second expiry).
- Gateway tool tests: mirror the existing thin-wrapper test pattern (forwards params correctly, propagates errors unchanged, resolves workspace correctly).
- Manual end-to-end verification (Richard's own step, not dispatched to a subagent): have a real MCP client render a small file locally, call `get_media_upload_url`, perform the actual POST itself, and confirm the resulting `publicUrl` renders correctly on a real post. This is the exact scenario that failed in production — it's the right acceptance test.
