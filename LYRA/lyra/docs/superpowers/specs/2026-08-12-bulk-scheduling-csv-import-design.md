# Bulk Scheduling / CSV Import — Design

**Date:** 2026-08-12
**Status:** Approved for build
**Wishlist item:** 5 (Bulk scheduling / CSV import)

---

## 1. Scope

Agencies plan content in spreadsheets today and re-key every post individually into the composer. This gives them a workspace-scoped downloadable template, a file upload with per-row validation, a review screen, and a commit step that creates real posts through the exact same rules any other post-creation path already follows.

**Despite the Wishlist item's name, the accepted upload format is `.xlsx`, not `.csv`** — see the format decision below. "CSV import" is kept as the feature's common name since that's how it's referred to elsewhere (Wishlist item 5, prior conversation); the file format itself is Excel.

### Decisions taken (Richard, 2026-08-12)

| Decision | Choice |
|---|---|
| Import model | A locked, downloadable template — not a flexible "upload your own spreadsheet and map columns" importer |
| Row-to-post mapping | **One row per platform.** A post going to Facebook and Instagram is two rows, not one row with a platform list |
| Media | Optional URL column. LYRA fetches and re-hosts to S3. A row with an unreachable URL still imports, flagged Awaiting Media |
| Import flow | **Review screen before commit.** Nothing touches the calendar until the user confirms, matching the AI Schedule Generator's existing pattern |
| Template format | **`.xlsx`**, with a locked dropdown on the Platform column, not plain CSV |
| Plan gating | None new. Governed by the same `canWrite` role check every other post-creation path already uses |

### Why a locked template, not column mapping

Every agency's existing spreadsheet is shaped differently. Building an importer that ingests an arbitrary file means auto-detecting headers, letting the user map "which column is the date," handling ambiguous or missing columns, and probably persisting that mapping per agency so they don't redo it every time — a real feature on its own, and one where a misread column fails silently in the worst way (a post scheduled on the wrong day, not a visible error). A template we generate removes the ambiguity entirely: parsing becomes "does this file match the template we handed out," not "guess what the user meant." The cost is real but one-sided in our favor for a v1 — an agency with its own format copies data into our template once per import, a few minutes of work, rather than us shipping something that can mis-schedule client content.

### Why `.xlsx` over plain CSV

A plain CSV template is simpler to generate and needs no new dependency, but it can't stop a typo before upload — "Facbook" in the Platform column is just a string until the server parses it. An `.xlsx` file with a real Excel data-validation dropdown on Platform (restricted to the workspace's own connected platforms) closes that specific error class before the file is ever uploaded, at the cost of one new dependency (`exceljs`, for both generating the template and parsing the upload) and a slightly heavier build than a text-file parser. Decided in favor of `.xlsx` — the dropdown is worth the dependency.

---

## 2. Template generation

`GET /api/workspaces/[id]/bulk-import/template`

Authenticated, workspace-scoped, requires `canWrite` on that workspace (same role gate `POST /api/posts` already uses). Generates an `.xlsx` on the fly via `exceljs` and streams it as a download — no file is persisted anywhere.

**Columns:**

| Column | Required | Notes |
|---|---|---|
| Date | Yes | `YYYY-MM-DD`. Interpreted in the workspace's own timezone, matching Calendar/Composer everywhere else |
| Time | Yes | `HH:MM`, 24-hour. Same timezone handling as Date |
| Platform | Yes | Locked dropdown (`exceljs` data validation), options generated from the workspace's currently-connected `SocialAccount`s only — not the full `Platform` enum. A workspace with no connected accounts gets a template whose dropdown is empty and a warning banner row explaining why |
| Caption | Yes | Free text |
| Media URL | No | A publicly reachable URL (e.g. a Drive/Dropbox share link or the agency's own hosting). Left blank for a text-only post |

The dropdown's source list is exactly the platform values `POST /api/posts` would accept for this workspace right now, so a row can never target a platform this workspace isn't actually connected to.

The generated file includes one example row (greyed out / clearly marked, not real data) showing the expected format, and a short instructions row at the top.

---

## 3. Upload and parse

`POST /api/workspaces/[id]/bulk-import/parse`

Accepts the filled-in `.xlsx` as a multipart upload. Rejects outright, before parsing any rows, if the file has more than 500 data rows (matching the safety-cap precedent already established elsewhere in this codebase, e.g. `GET /api/posts`'s 200-row cap and the SLA cron's 500-candidate cap).

For each row, in order:

1. **Required fields present** — Date, Time, Platform, Caption. Missing any → `error`.
2. **Date/Time parse cleanly** and combine to a valid future-or-present `scheduledAt` in the workspace timezone. Unparseable → `error`.
3. **Platform matches a connected `SocialAccount`** for this workspace. A value outside the dropdown's own options (someone typed over a locked cell, or opened the file in software that didn't enforce it) → `error`.
4. **Media compatibility**, if a Media URL is present — runs the same `checkMediaCompatibility` check `POST /api/posts` and the Composer already use (e.g. a GIF targeting Instagram). A known-bad combination → `error`, since unlike a broken link this is not something committing without media fixes.
5. **Media URL reachability**, if present and format-compatible — a lightweight `HEAD` request via the existing SSRF-hardened `safeFetch` (`lib/safe-fetch.ts`), not a full download. Unreachable, non-2xx, or a content-type that isn't image/video → `warning`, not `error`. The row is still importable; it just lands without media, the same as any other post created without one.

A row with no `error`-level issues is `ready`. The parse response is a JSON array, one entry per row, each carrying: the normalized post data (workspaceId, socialAccountId resolved from platform, content, scheduledAt, mediaUrl if present), a status (`ready` / `warning` / `error`), and — for `warning`/`error` — the specific reason. Nothing is written to the database at this stage. No file is persisted; the parsed row data lives in the response only.

---

## 4. Review screen

New page, `app/(dashboard)/workspace/[workspaceId]/calendar/bulk-import/page.tsx` (or a modal launched from the Calendar toolbar — implementation plan decides based on how much screen a 500-row table realistically needs).

Renders the parsed rows as a table: one row per CSV row, showing date/time/platform/caption (truncated)/media status, colour-coded by status. `error` rows are visibly blocking and cannot be included. `warning` rows are pre-checked for import by default (the post itself is valid; only its media is in question) but individually deselectable. `ready` rows are pre-checked and deselectable.

A summary line up top: "N ready, M with warnings, K blocked." The Import button is disabled if there are zero includable rows, and otherwise imports every currently-checked row.

**Explicitly out of scope for v1:** inline editing of a row's data in the browser. A blocked or unwanted row is fixed by editing the source file and re-uploading, not patched in the review table. This keeps the review screen a pure gate, not a second editor.

---

## 5. Commit

`POST /api/workspaces/[id]/bulk-import/commit`

Accepts the array of rows the user confirmed on the review screen (the already-parsed, already-validated data — the file itself is not re-uploaded or re-parsed here). For each row:

1. Resolves `finalStatus` exactly the way `POST /api/posts` already does: `SCHEDULED` normally, or `PENDING_APPROVAL` if the workspace has `clientAccessLevel: APPROVE` — reusing that existing logic, not reimplementing it.
2. If the row has a reachable media URL, fetches it via `safeFetch` and writes it to S3 via the existing `putObjectBuffer` helper (`lib/s3.ts`), keyed `media/${workspaceId}/${randomUUID()}.${ext}` — the exact pattern `app/api/upload/media-presign/route.ts:74` already uses for browser uploads. A row whose media fails at this stage (URL went down between parse and commit) still creates the post, without media, rather than failing the whole row this late.
3. Creates the `Post` row via the same shape `POST /api/posts` already builds (`workspaceId`, `socialAccountId`, `authorId`, `content`, `mediaUrls`, `status`, `scheduledAt`).

All rows in one commit are created in a single `prisma.$transaction`, matching `POST /api/posts`'s existing multi-account transaction pattern — either the whole batch lands or none of it does. Returns a summary (created count, and per-row result) which the frontend uses to show a final confirmation before returning to the calendar.

---

## 6. Data model

**None.** No new Prisma model and no schema changes. Every piece of state this feature needs (connected accounts, workspace timezone, approval routing, media compatibility rules) already exists on `Workspace`, `SocialAccount`, and `Post`. The uploaded file and its parsed rows are never persisted — they exist only for the duration of one parse-review-commit cycle, held in the browser between the parse and commit calls.

---

## 7. Files

**New**
- `lib/xlsx-template.ts` — generates the downloadable template (`exceljs`, dropdown validation)
- `lib/xlsx-parser.ts` — parses an uploaded `.xlsx` into raw rows (`exceljs`)
- `services/posts/bulk-import.ts` (+ test) — pure row-validation logic (steps 1–5 in §3), shared by the parse route and its tests without needing a real request
- `app/api/workspaces/[id]/bulk-import/template/route.ts`
- `app/api/workspaces/[id]/bulk-import/parse/route.ts`
- `app/api/workspaces/[id]/bulk-import/commit/route.ts`
- `app/(dashboard)/workspace/[workspaceId]/calendar/bulk-import/page.tsx` — upload + review screen
- `components/lyra/calendar/bulk-import-review-table.tsx`

**Modified**
- `components/lyra/calendar/content-calendar.tsx` — a "Bulk import" entry point in the toolbar
- `package.json` — add `exceljs`

---

## 8. Out of scope

- Inline row editing in the review screen (§4)
- Flexible column mapping / arbitrary spreadsheet upload (§1)
- Saving a "last used" template or import history
- CSV (plain-text) as an accepted upload format — `.xlsx` only, since that's what the dropdown validation requires
- Editing already-imported posts as a batch (each becomes a normal `Post`, edited individually afterward like any other)
