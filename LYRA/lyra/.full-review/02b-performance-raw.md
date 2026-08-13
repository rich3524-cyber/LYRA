# Step 2B — Performance & Scalability Analysis (raw agent output)

# LYRA Performance & Scalability Review — 2026-08-13

**Scope:** `app/`, `components/`, `services/`, `workers/`, `lib/`, `prisma/schema.prisma` (working directory `LYRA/lyra`). `lyra-mcp` gateway excluded. This is a fresh pass re-run against everything shipped since the 2026-08-02 review (MCP gateway Phase 3, bulk-import/CSV scheduling, self-approval deadlock fix, pre-beta security hardening, Railway cron migration).

**Method:** Direct inspection of `prisma/schema.prisma` against every query site that touches the flagged tables, plus a fresh sweep of `app/api/**`, `services/**`, and `workers/**` for missing indexes, unbounded fan-out, N+1 patterns, and caching gaps. Findings from the 2026-08-02 review were re-verified against current code rather than assumed still valid — several were confirmed fixed (noted inline) and are not re-flagged as open.

---

## Phase 1 carry-over verification

### 1. `WorkspaceAccess` missing a `workspaceId`-leading index — CONFIRMED, real, narrower than described

`prisma/schema.prisma:180-191`:

```prisma
model WorkspaceAccess {
  id          String    @id @default(cuid())
  userId      String
  workspaceId String
  ...
  @@unique([userId, workspaceId])
  @@index([userId])
}
```

Both indexes lead with `userId`. Postgres cannot use either for a predicate on `workspaceId` alone — a leftmost-prefix match requires `userId` to be present. Traced every call site touching this table and found **exactly one** production query matching that shape: `services/notifications/crisis-alert-email.ts:100-103`

```ts
prisma.workspaceAccess.findMany({
  where: { workspaceId, role: { in: ['SMB_OWNER', 'AGENCY_ADMIN'] } },
  select: { user: { select: { email: true } } },
}),
```

This is a full sequential scan of the entire `WorkspaceAccess` table (every access grant for every tenant), not just the target workspace's rows. Invoked from `services/ai/crisis-detector.ts:119`, gated by a compare-and-set on `Workspace.crisisActive` so it fires at most once per crisis event — genuinely rare today. The severity isn't in current call frequency; it's that (a) this is explicitly the low-latency "someone needs to know right now" path the Crisis Aware feature exists for, and (b) `WorkspaceAccess` is one of the tables that scales fastest with tenant count (every user x every workspace they can see), so the scan cost grows independent of how big any single workspace is. **Real but currently masked by low crisis frequency; will show up as a slow, safety-critical email once the table has tens of thousands of rows.**

**Severity: High** (correctness of the finding: confirmed; blast radius: currently narrow, grows with total tenant count)

**Fix:**
```sql
CREATE INDEX IF NOT EXISTS "WorkspaceAccess_workspaceId_role_idx" ON "WorkspaceAccess"("workspaceId", "role");
```
```prisma
@@index([workspaceId, role])
```
(Apply via the Supabase SQL editor per this repo's no-migrations convention, then add the line to `schema.prisma` to keep it documented — same pattern the 2026-08-02 fixes used.)

### 2. `Post @@index([workspaceId, createdAt])` missing — CONFIRMED, hits 3 real hot paths

Current `Post` indexes (`prisma/schema.prisma:267-271`):
```prisma
@@index([workspaceId, scheduledAt])
@@index([workspaceId, status])
@@index([status, scheduledAt])
@@index([publishedAt])
@@index([socialAccountId])
```
No index has `createdAt` as a sort-supporting trailing column after `workspaceId`. Three confirmed call sites order by `createdAt` on a `workspaceId`-filtered set with no matching index:

- `app/(dashboard)/workspace/[workspaceId]/page.tsx:71-84` — workspace overview page, `where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 5`. No status/date filter at all, so the planner can at best use `[workspaceId, status]`'s leading column to restrict to the workspace, then must gather and sort all matching rows for the top-5.
- `app/api/posts/route.ts:62-89` — the general posts list (calendar, drafts), `orderBy: { createdAt: 'desc' }, take: 200`. The route's own comment confirms callers like the drafts list hit this with `status` alone and no date range, meaning the `[workspaceId, status]` index doesn't bound the sort either.
- `app/api/brand-intelligence/build/route.ts:55-63` — `where: { workspaceId, status: { in: [...] } }, orderBy: { createdAt: 'desc' }, take: 40`.

For a workspace with a large post history (which is exactly the customer profile brand-intelligence and the dashboard both target), all three force Postgres to visit every row matching the `workspaceId` prefix and sort in memory instead of walking an index in already-sorted order.

**Severity: High** — three separate hot paths, one of which (workspace overview) loads on essentially every dashboard visit.

**Fix:**
```sql
CREATE INDEX IF NOT EXISTS "Post_workspaceId_createdAt_idx" ON "Post"("workspaceId", "createdAt" DESC);
```
```prisma
@@index([workspaceId, createdAt])
```

### 3. Broader index audit against actual query patterns

Re-derived the index list independently rather than trusting the Phase 1 list. Findings 1 and 2 above are the two real gaps in current query patterns. Everything else checked lines up correctly:

- `SocialAccount.zernioAccountId`, `Post.publishedAt`, `Post.socialAccountId`, `CrisisEvent.workspaceId` — all **already fixed** (present in `schema.prisma` and match `prisma/migrations-sql/2026-08-02-missing-fk-indexes.sql`; the webhook route at `app/api/zernio/webhook/route.ts:64-65,170-171` now benefits from the index). Not re-flagging.
- `Comment` — `[workspaceId, createdAt]` and `[workspaceId, status]` both exist and cover every comment query site found (inbox, dashboard counts, analytics). No gap.
- `NotificationChannel.workspaceId` is `@unique`, so `findUnique({where:{workspaceId}})` in `channel-notifier.ts:31` uses it correctly.
- `PostBoost @@index([status, endsAt])` matches the boost-expiry cron's query shape.
- `PostApproval @@index([status, slaAlertedAt])` matches the SLA cron.

No further missing-index findings beyond items 1 and 2.

### 4. Unbounded fan-out — CONFIRMED, and worse than described in one case

**Bulk-import media rehosting (`app/api/workspaces/[id]/bulk-import/commit/route.ts:140-142`) — this is the most severe finding in this review, more serious than the HEAD-check version originally flagged:**

```ts
const rehosted = await Promise.all(
  rows.map((row) => (row.mediaUrl ? rehostMedia(workspaceId, row.mediaUrl) : Promise.resolve(null)))
)
```

`rehostMedia` (lines 41-62) does a full `safeFetch(url)` **GET** (not HEAD), buffers the entire response body into memory (`Buffer.from(await res.arrayBuffer())` at line 52, via `lib/s3.ts`'s unstreamed `putObjectBuffer`), then does a synchronous S3 `PutObjectCommand`. With `BULK_IMPORT_MAX_DATA_ROWS = 500` (`lib/xlsx-template.ts:11`), a single commit with media on most rows fires **up to 500 concurrent full-file downloads, each fully buffered in Node memory, each followed by an S3 upload** — inside one Netlify serverless function invocation, no concurrency cap anywhere in the call chain. `safeFetch` (`lib/safe-fetch.ts`) has no request timeout either (confirmed by reading the full file — DNS resolution plus the undici fetch call have no `AbortController`/timeout), so a handful of slow or hung media hosts hold sockets open for the platform's full function-duration ceiling.

Video files in particular can be tens of MB; 500 of them in flight concurrently is a realistic OOM/function-timeout scenario on any real import with substantial media, not just a theoretical one.

The parse-time validation step (`services/posts/bulk-import.ts:163-175`, called from `validateImportRows` at line 199 via `Promise.all(rows.map(...))`) is the lighter HEAD-only version of the same unbounded pattern — same 500-row ceiling, same no-timeout `safeFetch`, no concurrency cap.

**Severity: Critical** (commit path) / **High** (parse path)

**Fix — cap concurrency and add a per-request timeout:**
```ts
// lib/concurrency.ts
export async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
```
```ts
// commit/route.ts
const rehosted = await mapWithConcurrency(rows, 8, (row) =>
  row.mediaUrl ? rehostMedia(workspaceId, row.mediaUrl) : Promise.resolve(null)
)
```
And add a timeout to `safeFetch` itself (it's the shared SSRF-hardened fetch used by 8 callers per its own docstring, so this fixes every caller at once):
```ts
// lib/safe-fetch.ts
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 3, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // ...pass { ...fetchInit, signal: controller.signal } to undiciFetch
  } finally {
    clearTimeout(timer)
  }
}
```

**Secondary, lower-severity finding in the same route:** the `$transaction(rows.map(...))` at lines 154-169 runs up to 500 sequential `post.create` calls inside one Postgres transaction, holding one connection for the whole batch. `workers/comment-monitor.worker.ts:172-184` already established the right pattern in this codebase (`createManyAndReturn` + `skipDuplicates`) for exactly this "create N rows, need the created rows back" shape — worth reusing here instead of an array-form transaction.

**`app/api/cron/sync-comments/route.ts` — uncapped, confirmed, and unlike every sibling cron:**
```ts
const accounts = await prisma.socialAccount.findMany({
  where: { isActive: true, workspace: { aiResponseMode: { not: 'OFF' } } },
  select: { id: true },
})              // <- no take
await Promise.all(accounts.map(a => commentMonitorQueue.add(...)))   // <- unbounded concurrent Redis calls
```
Every sibling cron caps its `findMany` (`publish-due-posts` at `take: 500`, `sync-metrics` at `take: 200`) specifically because this pattern was already flagged once before; `sync-comments` was missed. Runs every 5 minutes (per Handover doc) against **every active, AI-enabled account platform-wide**, no per-workspace or global cap. Not dangerous at current tenant count, but it's the one cron in the fleet that scales unbounded with total connected accounts, and the `Promise.all` fires that many concurrent BullMQ `.add()` calls in one request with no throttling.

**Severity: Medium** (currently small blast radius, but structurally the odd one out and will need the same cap its siblings already have well before it becomes an incident)

**Fix:**
```ts
const accounts = await prisma.socialAccount.findMany({
  where: { isActive: true, workspace: { aiResponseMode: { not: 'OFF' } } },
  select: { id: true },
  take: 500, // matches publish-due-posts' safety cap
})
```

**Competitor-monitor `addBulk` — re-assessed, lower severity than originally described:**
```ts
// workers/competitor-monitor.worker.ts:75-81
await competitorMonitorQueue.addBulk(
  competitors.map((c) => ({ name: 'scrape-competitor', data: { competitorId: c.id }, opts: { jobId: ... } }))
)
```
This *is* an unchunked `addBulk` over every competitor of every PRO/AGENCY workspace in one call — but the worker's own comment and structure show the actual external-scrape fan-out was already fixed: each competitor is its own job, and `Worker(..., { concurrency: 10 })` throttles the real outbound HTTP work to 10 concurrent scrapes regardless of how many jobs were enqueued. The remaining exposure is narrower than "500 concurrent HEAD requests" — it's a single large Redis pipeline write once a day, which only becomes a real concern at a competitor count in the low thousands+. **Downgrading this from the phase-1 framing.**

**Severity: Low** — worth a `take`/chunked-`addBulk` guard as the customer base grows, not urgent today.

---

## Fresh findings

### 5. `/api/analytics` and `/api/reports/generate` — unbounded per-request aggregation, no caching

`app/api/analytics/route.ts:30-41` and `app/api/reports/generate/route.ts:38-49` both do:
```ts
const posts = await prisma.post.findMany({
  where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: since } },
  include: { metrics: true, socialAccount: { select: { platform: true } } },
  // no take
})
```
`period` is user-controlled and clamped to 1-365 days (`analytics/route.ts:15`). Every request refetches and re-aggregates every published post + its metrics row in that window from scratch, in Node, on every dashboard load and every PDF generation — for the same underlying data that only changes once an hour (the `sync-metrics` cron cadence). No `take` limit either, so a high-volume workspace's yearly analytics view pulls its entire year of posts+metrics into memory per request.

**Severity: Medium** — not a correctness risk, but real, avoidable DB load and latency on a page users hit repeatedly, and it duplicates the exact computation `sync-metrics` already knows the cadence of.

**Fix:** cache the aggregated summary keyed by `(workspaceId, period)` with a TTL just past the metrics-sync cadence (e.g. Redis, 55-minute TTL), invalidate-or-let-expire rather than push-invalidate since the data source (metrics sync) is itself on a fixed schedule:
```ts
const cacheKey = `analytics:${workspaceId}:${period}`
const cached = await redisClient.get(cacheKey)
if (cached) return NextResponse.json(JSON.parse(cached))
// ...compute...
await redisClient.set(cacheKey, JSON.stringify(payload), 'EX', 3300)
```
Also add a `take` cap or push the aggregation into SQL (`groupBy`/raw aggregate query) instead of pulling every row into Node.

### 6. `sync-metrics` cron's `take: 200` cap is global, not per-tenant

`app/api/cron/sync-metrics/route.ts:16-29` queries with **no `workspaceId` filter at all** — it's a platform-wide query, capped at 200 posts needing a metrics refresh, running once an hour. That's fine today, but it doesn't scale with tenant count: as the number of active, publishing workspaces grows, 200 slots/hour platform-wide becomes the ceiling on how fast the whole platform's analytics data can stay fresh, and a busy hour could permanently starve smaller/newer workspaces if larger ones' backlogs keep consuming the 200 slots first (there's no fairness ordering — whatever `findMany` returns first, likely oldest-`publishedAt`-first by default ordering, wins).

**Severity: Medium** (not urgent at current scale; becomes a real freshness problem as tenant count grows)

**Fix:** either raise the cap and run more frequently as volume grows, or make the selection fairer across workspaces (round-robin by workspace rather than a flat `take`), or shard the query by `workspaceId % N` across more frequent smaller runs.

### 7. `analyzeEngagement` — unbounded historical scan, now off the request path but still unbounded

`services/ai/engagement-analyzer.ts:51-74` fetches **all-time** published posts with any nonzero engagement metric for a workspace, no date filter, no `take`. The Netlify-timeout version of this problem was already fixed (moved to a BullMQ job on the `brand-sync` worker, per Handover), so this is no longer a request-path risk. But the query itself is still unbounded: a workspace with years of posting history will have this worker job pull its entire lifetime of posts+metrics into memory every time it runs (triggered by `brand-refresh` cron). Posting-time-pattern analysis has no real reason to look further back than ~12-18 months anyway (platform algorithms and audience behavior drift), so this is a low-risk-but-free optimization.

**Severity: Low** (worker-side now, more execution headroom, but still worth bounding before it becomes the next "why is brand-sync slow" ticket)

**Fix:**
```ts
const since = new Date(); since.setMonth(since.getMonth() - 15)
const posts = await prisma.post.findMany({
  where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: since, not: null }, ... },
  ...
})
```

### 8. No shared frontend data-fetching/caching layer — confirmed still true

No `swr`, `@tanstack/react-query`, or equivalent in `package.json`. 39 files under `components/`/`app/` still make raw `fetch()` calls directly from client components with no request deduplication or client-side cache. Navigating away from and back to the dashboard, calendar, or analytics re-fetches everything from zero every time, and two components mounted simultaneously that need the same data (e.g. workspace summary on both the sidebar and the overview page) issue duplicate requests.

**Severity: Medium** — this is a real, broad-based finding, not a single hot spot; the fix is a one-time investment (adopt SWR or React Query for the ~10 highest-traffic fetches: workspace summary, posts list, comments, analytics) rather than a per-call patch.

### 9. Oversized client components — restated, still true, unconfirmed via profiling

`components/lyra/composer/post-composer.tsx` (539 lines, 14 `useState` hooks) and `components/lyra/calendar/post-detail-panel.tsx` (671 lines — grew from 606 since the last review, 10 `useState` hooks) remain wide-surface components where any one piece of local state re-renders the whole tree. No render-profiler trace was run in this review (same caveat as last time), so treat this as a flagged candidate, not a confirmed bottleneck.

**Severity: Low** — flag for a React DevTools profiler pass, not immediate action.

**Fix pattern (if profiling confirms):** split into a state-holding container plus memoized presentational children (`React.memo` on the read-only preview/list sections), or consolidate related `useState` calls into a single `useReducer` to cut re-render fan-out.

### 10. `comment-monitor.worker.ts` LinkedIn native path — sequential external calls, bounded but serial

`workers/comment-monitor.worker.ts:139-150`:
```ts
const posts = await linkedin.getOrgPosts(token, account.platformId)
for (const post of posts.slice(0, 10)) {
  const comments = await linkedin.getPostComments(token, post.urn)   // sequential, not parallel
  ...
}
```
Up to 10 sequential (not `Promise.all`'d) external API calls per LinkedIn account per 5-minute tick. Bounded (capped at 10), so not a scalability risk, but each account's poll takes ~10x one round-trip longer than it needs to. This is the legacy pre-Zernio path — per the surrounding comments, Zernio is the default going forward, so this is lower priority to fix, but worth noting since it's still live code for any account not yet migrated.

**Severity: Low**

### 11. Dashboard home — correlated per-workspace subquery, fine at current scale, worth watching

`app/(dashboard)/dashboard/page.tsx:93-106`:
```ts
prisma.workspace.findMany({
  where: { id: { in: workspaceIds } },
  select: {
    ...
    _count: { select: { posts: { where: { comments: { some: { status: 'PENDING' } } } } } },
  },
})
```
Prisma compiles this `_count` with a nested `where` into a correlated subquery per workspace row, done inside a single round trip (not an N+1 in the classic sense — one query, not one-per-workspace). For an agency user with a large number of workspaces this is still `O(workspaces)` correlated subqueries evaluated per request on every dashboard load. Not a problem at typical agency workspace counts (tens), worth revisiting if any agency account grows into hundreds of workspaces.

**Severity: Low**

---

## Summary table

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `WorkspaceAccess` no `workspaceId`-leading index — crisis alert email full scan | High | Confirmed open |
| 2 | `Post` missing `[workspaceId, createdAt]` — 3 hot paths force in-memory sort | High | Confirmed open |
| 3 | Bulk-import commit: unbounded concurrent media downloads/buffers/S3 uploads | **Critical** | Confirmed open, worse than described |
| 3b | Bulk-import parse: unbounded concurrent HEAD checks, `safeFetch` has no timeout | High | Confirmed open |
| 4 | `sync-comments` cron: uncapped `findMany` + unbounded `Promise.all` fan-out | Medium | Confirmed open |
| 5 | `/api/analytics`, `/api/reports/generate`: unbounded query, no caching | Medium | Confirmed open |
| 6 | `sync-metrics` cron: global (not per-tenant) `take: 200` cap | Medium | New, scale ceiling |
| 7 | `analyzeEngagement`: unbounded all-time query (now worker-side) | Low | Confirmed open, lower severity than it would be on request path |
| 8 | No shared frontend fetch/cache layer (39 raw `fetch()` call sites) | Medium | Confirmed still true |
| 9 | Oversized `post-composer.tsx` / `post-detail-panel.tsx` | Low | Restated, unprofiled |
| 10 | LinkedIn native comment path: sequential (not parallel) per-account calls | Low | New, bounded |
| 11 | Dashboard home: correlated per-workspace `_count` subquery | Low | New, fine at current scale |
| — | Competitor-monitor `addBulk` unchunked | Low | Re-assessed down from Phase 1 framing — actual scrape fan-out already throttled |
| — | `SocialAccount.zernioAccountId`, `Post.publishedAt`/`.socialAccountId`, `CrisisEvent.workspaceId` indexes | — | **Already fixed**, verified in schema |
| — | `sync-metrics` inline-Netlify-timeout risk | — | **Already fixed** — offloaded to `workers/metrics-sync.worker.ts` |
| — | Non-atomic rate limiter | — | **Already fixed** — atomic Lua `INCR`+`EXPIRE`, Redis-backed (`lib/rate-limit.ts`) |
| — | Comment-monitor N+1 (findFirst-then-create per comment) | — | **Already fixed** — `createManyAndReturn` + `skipDuplicates` |
| — | App/worker connection-pool sharing (`connection_limit=1`) | — | Was a false positive in the prior review (local `.env.local` misread as prod config); not re-investigated here since it requires live environment access this review doesn't have |

## Key files referenced

- `prisma/schema.prisma:180-191` (WorkspaceAccess), `:240-272` (Post)
- `services/notifications/crisis-alert-email.ts:100-103`
- `app/(dashboard)/workspace/[workspaceId]/page.tsx:71-84`
- `app/api/posts/route.ts:62-89`
- `app/api/brand-intelligence/build/route.ts:55-63`
- `app/api/workspaces/[id]/bulk-import/commit/route.ts:41-62,140-142,154-169`
- `services/posts/bulk-import.ts:163-175,191-200`
- `lib/safe-fetch.ts` (no timeout, full file read)
- `app/api/cron/sync-comments/route.ts:11-30`
- `app/api/cron/sync-metrics/route.ts:16-29`
- `app/api/analytics/route.ts:30-41`
- `app/api/reports/generate/route.ts:38-49`
- `services/ai/engagement-analyzer.ts:51-74`
- `workers/competitor-monitor.worker.ts:75-81`
- `workers/comment-monitor.worker.ts:139-150,172-184`
