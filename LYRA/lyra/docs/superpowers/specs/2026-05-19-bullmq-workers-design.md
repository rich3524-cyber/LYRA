# BullMQ Workers & Railway Deployment — Design Spec

**Date:** 2026-05-19  
**Status:** Approved for implementation

---

## Overview

LYRA's background processing layer uses BullMQ (backed by Upstash Redis) to handle four long-running jobs: publishing scheduled posts, monitoring platform comments, generating AI responses, and refreshing brand intelligence profiles. Workers run as a single Node.js process on Railway. Cron-job.org calls Netlify API endpoints on schedule to feed the queues.

---

## Infrastructure

### Upstash Redis

- Free tier, region: `ap-southeast-1`
- One database shared across all four queues
- Connection string (`REDIS_URL`) added to both Netlify and Railway environment variables
- Format: `redis://:password@your-instance.upstash.io:6379`

### Railway

- Single service in a new Railway project
- Connects to `rich3524-cyber/LYRA` GitHub repo
- Root directory: `/` (repo root from Railway's perspective is the `lyra/` project)
- Start command: `npx tsx workers/index.ts`
- Restart policy: `ON_FAILURE`, max 3 retries
- Environment variables: full copy of Netlify env vars + `REDIS_URL`
- `DATABASE_URL` uses Supabase pooled URL (port 6543) — workers make normal Prisma queries, not migrations

### Cron scheduling (cron-job.org)

Four HTTP jobs hitting Netlify endpoints with `Authorization: Bearer <CRON_SECRET>` header:

| Endpoint | Schedule | Purpose |
|---|---|---|
| `GET /api/cron/publish-due-posts` | Every minute | Queue posts where `scheduledAt <= now` |
| `GET /api/cron/sync-comments` | Every 5 minutes | Queue comment polls |
| `GET /api/cron/sync-metrics` | Every hour | Upsert PostMetrics rows |
| `GET /api/cron/brand-refresh` | Weekly (Sun 00:00 UTC) | Queue brand syncs + engagement analysis |

`CRON_SECRET` is a 32-byte random hex string. Generate with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## File Map

### Create
- `lib/redis.ts` — Redis connection factory
- `workers/index.ts` — entry point, starts all workers, graceful shutdown
- `workers/brand-sync.worker.ts` — brand profile refresh worker
- `workers/post-publisher.worker.ts` — scheduled post publisher worker
- `workers/comment-monitor.worker.ts` — platform comment polling worker
- `workers/ai-responder.worker.ts` — AI comment response drafting worker
- `app/api/cron/publish-due-posts/route.ts` — new cron endpoint to queue due posts
- `railway.toml` — Railway deployment config

### Modify
- `package.json` — add `tsx` as dev dependency

---

## Section 1: Shared Infrastructure

### `lib/redis.ts`

Exports `getRedisConnection()` returning an ioredis-compatible connection options object used by all BullMQ Queue and Worker instances. The connection is established lazily by BullMQ — importing a worker file in Next.js (to access its Queue) is safe even when Redis is not reachable in that context.

```typescript
import type { ConnectionOptions } from 'bullmq'

export function getRedisConnection(): ConnectionOptions {
  return {
    host: new URL(process.env.REDIS_URL!).hostname,
    port: Number(new URL(process.env.REDIS_URL!).port) || 6379,
    password: new URL(process.env.REDIS_URL!).password,
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
  }
}
```

`maxRetriesPerRequest: null` is required by BullMQ — without it BullMQ throws an error on startup.

### Worker file pattern

Every worker file has exactly two exports:

1. **Named Queue export** — created at module init so Next.js cron routes can import and enqueue jobs
2. **`startWorker()` function** — creates and returns the BullMQ Worker instance; only called by `workers/index.ts`

```typescript
import { Queue, Worker } from 'bullmq'
import { getRedisConnection } from '@/lib/redis'

export const exampleQueue = new Queue('queue-name', {
  connection: getRedisConnection(),
})

export function startWorker() {
  const worker = new Worker('queue-name', async (job) => {
    // process job.data
  }, { connection: getRedisConnection() })

  worker.on('failed', (job, err) => {
    console.error(`[queue-name] job ${job?.id} failed:`, err.message)
  })

  return worker
}
```

### `workers/index.ts`

Imports all four worker files, calls `startWorker()` on each, registers SIGTERM/SIGINT handlers for graceful shutdown.

```typescript
import { startWorker as startBrandSync } from './brand-sync.worker'
import { startWorker as startPostPublisher } from './post-publisher.worker'
import { startWorker as startCommentMonitor } from './comment-monitor.worker'
import { startWorker as startAiResponder } from './ai-responder.worker'

const workers = [
  startBrandSync(),
  startPostPublisher(),
  startCommentMonitor(),
  startAiResponder(),
]

async function shutdown() {
  console.log('Shutting down workers...')
  await Promise.all(workers.map(w => w.close()))
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('All workers started')
```

---

## Section 2: Individual Workers

### Brand Sync Worker

**Queue:** `brand-sync`  
**Producer:** `app/api/cron/brand-refresh/route.ts` (already implemented)  
**Payload:** `{ workspaceId: string }`

**Processing:**
1. Fetch workspace (id, websiteUrl, brandProfile)
2. Call `scraper.ts` — scrape homepage + up to 4 internal links
3. Fetch workspace's recent published posts from DB
4. Call `profile-builder.ts` — send scraped content + posts to Claude, get structured brand profile
5. Save result to `BrandProfile` (upsert), update `lastScrapedAt`
6. On error: log with workspaceId, rethrow so BullMQ retries

**Job options:** `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`

**Status:** Fully functional with current platform access.

---

### Post Publisher Worker

**Queue:** `post-publishing`  
**Producer:** New `/api/cron/publish-due-posts` cron route  
**Payload:** `{ postId: string }`

**New cron route** (`app/api/cron/publish-due-posts/route.ts`) — GET:
- Authenticates with CRON_SECRET bearer token
- Queries posts where `status = SCHEDULED` AND `scheduledAt <= now`
- For each post, adds a job to `post-publishing` queue with `jobId: post-{postId}` (deduplicates if cron fires while a prior job is still processing)
- Returns `{ queued: N }`

**Worker processing:**
1. Fetch post with socialAccount
2. If `post.status !== 'SCHEDULED'` — skip (already handled, e.g. manually cancelled)
3. Mark post `status = PUBLISHING` (prevents double-publish)
4. Decrypt `socialAccount.accessToken` using `lib/encrypt.ts`
5. Call platform-specific publish function from `services/social/{platform}.ts`
6. On success: update `status = PUBLISHED`, `publishedAt = now`, `platformPostId = returned ID`
7. On failure: update `status = FAILED`, log error reason

**Platform handling:**
- `LINKEDIN` — fully wired once `w_member_social` scope approved; for now marks FAILED with reason `"LinkedIn posting scope not yet approved"`
- `FACEBOOK`, `INSTAGRAM`, `TWITTER`, `TIKTOK`, `GOOGLE_BUSINESS`, `YOUTUBE` — marks FAILED with reason `"Platform not connected"` until developer apps created and scopes approved
- Unknown platform — marks FAILED with reason `"Unsupported platform"`

**Job options:** `attempts: 2`, `backoff: { type: 'fixed', delay: 10000 }`  
No exponential backoff — a post that failed once should retry once quickly, then stay FAILED so the user can see it.

---

### Comment Monitor Worker

**Queue:** `comment-monitoring`  
**Producer:** `app/api/cron/sync-comments/route.ts` (already implemented)  
**Payload:** `{ socialAccountId: string }`

**Processing:**
1. Fetch `SocialAccount` with workspace (id, platform, accessToken, lastCommentSyncAt, workspace.aiResponseMode)
2. If `workspace.aiResponseMode === 'OFF'` — skip (no comment monitoring needed)
3. Decrypt `accessToken`
4. Call platform-specific comment fetch (since `lastCommentSyncAt ?? 24 hours ago`)
5. For each new comment:
   a. Upsert `Comment` record (`platformCommentId` as unique key)
   b. If `status = PENDING` and workspace AI mode is not OFF: enqueue `ai-responding` job with `{ commentId }`
6. Update `socialAccount.lastCommentSyncAt = now`

**Platform handling:**
- `FACEBOOK`, `INSTAGRAM` — stubbed: log `"[comment-monitor] Facebook/Instagram comment API not yet wired"`, update sync time, return
- `LINKEDIN`, `GOOGLE_BUSINESS`, `TWITTER`, `TIKTOK`, `YOUTUBE` — same stub pattern
- All stubs still update `lastCommentSyncAt` so the worker doesn't re-process the same window repeatedly

**Job options:** `attempts: 2`, `backoff: { type: 'fixed', delay: 3000 }`

---

### AI Responder Worker

**Queue:** `ai-responding`  
**Producer:** Comment Monitor worker (enqueues after creating new Comment records)  
**Payload:** `{ commentId: string }`

**Processing:**
1. Fetch `Comment` with post, socialAccount, workspace (brandProfile, guardrails, aiResponseMode)
2. If `comment.status !== 'PENDING'` — skip (already handled)
3. If `workspace.aiResponseMode === 'OFF'` — skip
4. Build response prompt using brand profile + guardrails
5. Call `services/ai/response-generator.ts` (Claude `claude-sonnet-4-6`)
6. Create `CommentResponse` record with generated text
7. Update `Comment.status`:
   - `FULL` autonomy → `APPROVED` (ready for the posting worker to send)
   - `DRAFT_APPROVE` → `AI_DRAFTED` (waits for human approval in inbox)
8. On error: update `Comment.status = ESCALATED`, log error

**Job options:** `attempts: 2`, `backoff: { type: 'exponential', delay: 2000 }`

---

## Section 3: Railway Config

### `railway.toml`

```toml
[deploy]
startCommand = "npx tsx workers/index.ts"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### `package.json` change

Add `tsx` to devDependencies:
```json
"tsx": "^4.19.2"
```

---

## Section 4: Environment Variables

### Added to Netlify

| Variable | Value |
|---|---|
| `REDIS_URL` | Upstash Redis connection string |
| `CRON_SECRET` | 32-byte random hex string |

### Railway service env vars

Full copy of all Netlify env vars, plus:

| Variable | Value |
|---|---|
| `REDIS_URL` | Same Upstash Redis connection string |
| `DATABASE_URL` | Supabase pooled URL (port 6543, pgbouncer=true) |
| `DIRECT_URL` | Not needed on Railway (no migrations run there) |

---

## What This Is Not

- This does not implement live platform API calls for Facebook, Instagram, Twitter, TikTok, or Google Business — those are stubbed pending developer app approval
- This does not implement the actual comment posting back to platforms — the AI Responder creates response drafts; a future "response poster" step handles sending them
- This does not require any new database models
- The cron routes do not change their authentication pattern — all use `CRON_SECRET` bearer token
