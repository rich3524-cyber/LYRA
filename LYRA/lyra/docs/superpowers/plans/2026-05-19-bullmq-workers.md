# BullMQ Workers & Railway Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the four BullMQ workers (brand-sync, post-publisher, comment-monitor, ai-responder), their Railway entry point, and the missing cron route — so LYRA can schedule posts, monitor comments, and respond autonomously.

**Architecture:** Each worker file exports a named Queue (imported by Next.js cron routes to enqueue jobs) and a `startWorker()` function (called only by `workers/index.ts` on Railway). `lib/redis.ts` provides the shared `ConnectionOptions` object. The workers/index.ts entry point starts all four workers and handles graceful shutdown on SIGTERM/SIGINT.

**Tech Stack:** BullMQ 5.x, ioredis 5.x (already installed), tsx 4.x (to be added), Prisma, Anthropic Claude API, lib/encrypt.ts (AES-256-GCM), services/brand-intelligence/scraper.ts, services/brand-intelligence/profile-builder.ts, services/ai/response-generator.ts.

---

## File Map

### Create
- `lib/redis.ts` — Redis ConnectionOptions factory; also exports `redis` const for existing cron routes
- `workers/brand-sync.worker.ts` — brand profile refresh worker
- `workers/comment-monitor.worker.ts` — platform comment polling worker
- `workers/ai-responder.worker.ts` — AI comment response drafting worker
- `workers/post-publisher.worker.ts` — scheduled post publisher worker
- `workers/index.ts` — entry point: starts all workers, handles graceful shutdown
- `app/api/cron/publish-due-posts/route.ts` — cron route to queue due posts
- `railway.toml` — Railway deployment config

### Modify
- `prisma/schema.prisma` — add `lastCommentSyncAt DateTime?` to SocialAccount
- `package.json` — add `tsx` to devDependencies

---

## Task 1: Schema patch + Redis factory + tsx

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/redis.ts`
- Modify: `package.json`

- [ ] **Step 1: Add `lastCommentSyncAt` field to SocialAccount in schema**

In `prisma/schema.prisma`, find the `SocialAccount` model. Add the field after `isActive`:

```prisma
model SocialAccount {
  id                  String    @id @default(cuid())
  workspaceId         String
  workspace           Workspace @relation(fields: [workspaceId], references: [id])
  platform            Platform
  platformId          String
  handle              String
  name                String
  avatarUrl           String?
  accessToken         String
  refreshToken        String?
  tokenExpiry         DateTime?
  webhookId           String?
  isActive            Boolean   @default(true)
  lastCommentSyncAt   DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  posts    Post[]
  comments Comment[]

  @@unique([workspaceId, platform, platformId])
}
```

- [ ] **Step 2: Regenerate Prisma client**

Run from `lyra/` directory:
```bash
npx prisma generate
```

Expected: `Generated Prisma Client...` with no errors.

- [ ] **Step 3: Apply schema to production Supabase**

This must be run in Windows CMD (not PowerShell) — PowerShell's `set` syntax is different.

Open CMD, navigate to `lyra/`, set env vars, then push:
```cmd
set DATABASE_URL=postgresql://postgres.yourproject:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
set DIRECT_URL=postgresql://postgres.yourproject:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
npx prisma db push
```

Use the actual values from Netlify env vars. Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Create `lib/redis.ts`**

```typescript
import type { ConnectionOptions } from 'bullmq'

export function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL
  if (!url) {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null }
  }
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    tls: url.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
  }
}

export const redis = getRedisConnection()
```

`maxRetriesPerRequest: null` is required by BullMQ — without it BullMQ throws on startup. The `redis` named export satisfies the existing `app/api/cron/sync-comments/route.ts` import. The `getRedisConnection()` function is used by all worker files.

- [ ] **Step 5: Add `tsx` to devDependencies in `package.json`**

In `package.json`, inside `"devDependencies"`, add:
```json
"tsx": "^4.19.2"
```

- [ ] **Step 6: Install the new dependency**

```bash
npm install
```

Expected: package-lock.json updated, `tsx` appears in `node_modules/.bin/tsx`.

- [ ] **Step 7: Run type check to verify redis.ts is clean**

```bash
npx tsc --noEmit
```

Expected: No errors on `lib/redis.ts`. There will be errors about missing worker files — that's fine at this stage.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/redis.ts package.json package-lock.json
git commit -m "feat: add lastCommentSyncAt to SocialAccount schema and Redis connection factory"
```

---

## Task 2: Brand Sync Worker

**Files:**
- Create: `workers/brand-sync.worker.ts`

Note: `app/api/cron/brand-refresh/route.ts` already imports `{ brandSyncQueue }` from this file — creating it here fixes the current build error on that route.

- [ ] **Step 1: Create `workers/brand-sync.worker.ts`**

```typescript
import { Queue, Worker } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getRedisConnection } from '@/lib/redis'
import { scrapeWebsite } from '@/services/brand-intelligence/scraper'
import { buildBrandProfile } from '@/services/brand-intelligence/profile-builder'
import type { Prisma } from '@prisma/client'

export const brandSyncQueue = new Queue('brand-sync', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})

export function startWorker() {
  const worker = new Worker(
    'brand-sync',
    async (job) => {
      const { workspaceId } = job.data as { workspaceId: string }

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, websiteUrl: true, brandProfile: true },
      })

      if (!workspace?.websiteUrl) {
        console.log(`[brand-sync] workspace ${workspaceId} has no websiteUrl — skipping`)
        return
      }

      const scraped = await scrapeWebsite(workspace.websiteUrl)

      const recentPosts = await prisma.post.findMany({
        where: { workspaceId, status: 'PUBLISHED' },
        select: { content: true },
        orderBy: { publishedAt: 'desc' },
        take: 20,
      })
      const postTexts = recentPosts.map((p) => p.content)

      const profile = await buildBrandProfile(scraped, '', postTexts)

      await prisma.brandProfile.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          voiceSummary: profile.voiceSummary,
          toneAttributes: profile.toneAttributes,
          contentThemes: profile.contentThemes,
          audienceProfile: profile.audienceProfile as Prisma.InputJsonValue,
          lastScrapedAt: new Date(),
        },
        update: {
          voiceSummary: profile.voiceSummary,
          toneAttributes: profile.toneAttributes,
          contentThemes: profile.contentThemes,
          audienceProfile: profile.audienceProfile as Prisma.InputJsonValue,
          lastScrapedAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      })

      console.log(`[brand-sync] workspace ${workspaceId} profile updated`)
    },
    { connection: getRedisConnection() }
  )

  worker.on('failed', (job, err) => {
    console.error(`[brand-sync] job ${job?.id} failed:`, err.message)
  })

  return worker
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors on `workers/brand-sync.worker.ts`. Remaining errors are about the other worker files not existing yet.

- [ ] **Step 3: Commit**

```bash
git add workers/brand-sync.worker.ts
git commit -m "feat: add brand-sync BullMQ worker"
```

---

## Task 3: Comment Monitor Worker

**Files:**
- Create: `workers/comment-monitor.worker.ts`

- [ ] **Step 1: Create `workers/comment-monitor.worker.ts`**

```typescript
import { Queue, Worker } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getRedisConnection } from '@/lib/redis'
import { subHours } from 'date-fns'

export const commentMonitoringQueue = new Queue('comment-monitoring', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 3000 },
  },
})

export function startWorker() {
  const worker = new Worker(
    'comment-monitoring',
    async (job) => {
      const { socialAccountId } = job.data as { socialAccountId: string }

      const account = await prisma.socialAccount.findUnique({
        where: { id: socialAccountId },
        include: { workspace: { select: { id: true, aiResponseMode: true } } },
      })

      if (!account) {
        console.log(`[comment-monitor] account ${socialAccountId} not found — skipping`)
        return
      }

      if (account.workspace.aiResponseMode === 'OFF') {
        console.log(`[comment-monitor] workspace ${account.workspace.id} aiResponseMode is OFF — skipping`)
        return
      }

      const since = account.lastCommentSyncAt ?? subHours(new Date(), 24)

      switch (account.platform) {
        case 'FACEBOOK':
          console.log(`[comment-monitor] Facebook comment API not yet wired (account ${socialAccountId})`)
          break
        case 'INSTAGRAM':
          console.log(`[comment-monitor] Instagram comment API not yet wired (account ${socialAccountId})`)
          break
        case 'LINKEDIN':
          console.log(`[comment-monitor] LinkedIn comment API not yet wired (account ${socialAccountId})`)
          break
        case 'GOOGLE_BUSINESS':
          console.log(`[comment-monitor] Google Business review API not yet wired (account ${socialAccountId})`)
          break
        case 'TWITTER':
          console.log(`[comment-monitor] Twitter comment API not yet wired (account ${socialAccountId})`)
          break
        case 'TIKTOK':
          console.log(`[comment-monitor] TikTok comment API not yet wired (account ${socialAccountId})`)
          break
        case 'YOUTUBE':
          console.log(`[comment-monitor] YouTube comment API not yet wired (account ${socialAccountId})`)
          break
        default:
          console.log(`[comment-monitor] unsupported platform ${account.platform} (account ${socialAccountId})`)
      }

      // All stubs update lastCommentSyncAt so the next run doesn't re-process the same window
      void since // referenced to suppress lint warning
      await prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: { lastCommentSyncAt: new Date() },
      })
    },
    { connection: getRedisConnection() }
  )

  worker.on('failed', (job, err) => {
    console.error(`[comment-monitor] job ${job?.id} failed:`, err.message)
  })

  return worker
}
```

When platform APIs are wired in a future plan, the comment monitor will import `aiRespondingQueue` from `@/workers/ai-responder.worker` to enqueue AI jobs after upserting new Comment records.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors on `workers/comment-monitor.worker.ts`.

- [ ] **Step 3: Commit**

```bash
git add workers/comment-monitor.worker.ts
git commit -m "feat: add comment-monitor BullMQ worker (all platforms stubbed)"
```

---

## Task 4: AI Responder Worker

**Files:**
- Create: `workers/ai-responder.worker.ts`

- [ ] **Step 1: Create `workers/ai-responder.worker.ts`**

```typescript
import { Queue, Worker } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getRedisConnection } from '@/lib/redis'
import { generateCommentResponse } from '@/services/ai/response-generator'

export const aiRespondingQueue = new Queue('ai-responding', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
  },
})

export function startWorker() {
  const worker = new Worker(
    'ai-responding',
    async (job) => {
      const { commentId } = job.data as { commentId: string }

      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          socialAccount: {
            include: {
              workspace: {
                include: {
                  brandProfile: true,
                  guardrails: true,
                },
              },
            },
          },
        },
      })

      if (!comment) {
        console.log(`[ai-responder] comment ${commentId} not found — skipping`)
        return
      }

      if (comment.status !== 'PENDING') {
        console.log(`[ai-responder] comment ${commentId} status is ${comment.status} — skipping`)
        return
      }

      const { workspace } = comment.socialAccount

      if (workspace.aiResponseMode === 'OFF') {
        console.log(`[ai-responder] workspace ${workspace.id} aiResponseMode is OFF — skipping`)
        return
      }

      const generated = await generateCommentResponse(
        comment,
        workspace.brandProfile,
        workspace.guardrails
      )

      if (generated.shouldEscalate || !generated.response) {
        await prisma.comment.update({
          where: { id: commentId },
          data: {
            status: 'ESCALATED',
            isEscalated: true,
            escalationReason: generated.escalationReason ?? 'AI determined escalation required',
          },
        })
        console.log(`[ai-responder] comment ${commentId} escalated: ${generated.escalationReason}`)
        return
      }

      await prisma.commentResponse.create({
        data: {
          commentId,
          content: generated.response,
          aiGenerated: true,
        },
      })

      const newStatus = workspace.aiResponseMode === 'FULL' ? 'APPROVED' : 'AI_DRAFTED'

      await prisma.comment.update({
        where: { id: commentId },
        data: { status: newStatus },
      })

      console.log(`[ai-responder] comment ${commentId} → ${newStatus}`)
    },
    { connection: getRedisConnection() }
  )

  worker.on('failed', (job, err) => {
    console.error(`[ai-responder] job ${job?.id} failed:`, err.message)
  })

  return worker
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors on `workers/ai-responder.worker.ts`.

- [ ] **Step 3: Commit**

```bash
git add workers/ai-responder.worker.ts
git commit -m "feat: add ai-responder BullMQ worker"
```

---

## Task 5: Post Publisher Worker + cron route

**Files:**
- Create: `workers/post-publisher.worker.ts`
- Create: `app/api/cron/publish-due-posts/route.ts`

- [ ] **Step 1: Create `workers/post-publisher.worker.ts`**

```typescript
import { Queue, Worker } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getRedisConnection } from '@/lib/redis'
import { decrypt } from '@/lib/encrypt'

export const postPublishingQueue = new Queue('post-publishing', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
  },
})

async function publishPost(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { socialAccount: true },
  })

  if (!post) {
    console.log(`[post-publisher] post ${postId} not found — skipping`)
    return
  }

  if (post.status !== 'SCHEDULED') {
    console.log(`[post-publisher] post ${postId} status is ${post.status} — skipping`)
    return
  }

  await prisma.post.update({
    where: { id: postId },
    data: { status: 'PUBLISHING' },
  })

  let failReason: string | null = null

  try {
    void decrypt(post.socialAccount.accessToken) // verify token is decryptable

    switch (post.socialAccount.platform) {
      case 'LINKEDIN':
        failReason = 'LinkedIn posting scope not yet approved'
        break
      case 'FACEBOOK':
      case 'INSTAGRAM':
      case 'TWITTER':
      case 'TIKTOK':
      case 'GOOGLE_BUSINESS':
      case 'YOUTUBE':
      case 'PINTEREST':
      case 'THREADS':
      case 'BLUESKY':
        failReason = 'Platform not connected'
        break
      default:
        failReason = 'Unsupported platform'
    }
  } catch (err) {
    failReason = err instanceof Error ? err.message : 'Unknown publish error'
  }

  if (failReason) {
    await prisma.post.update({
      where: { id: postId },
      data: { status: 'FAILED' },
    })
    console.error(`[post-publisher] post ${postId} failed: ${failReason}`)
    return
  }

  // Successful publish path — reached once a platform is fully wired
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })
  console.log(`[post-publisher] post ${postId} published`)
}

export function startWorker() {
  const worker = new Worker(
    'post-publishing',
    async (job) => {
      const { postId } = job.data as { postId: string }
      await publishPost(postId)
    },
    { connection: getRedisConnection() }
  )

  worker.on('failed', (job, err) => {
    console.error(`[post-publisher] job ${job?.id} failed:`, err.message)
  })

  return worker
}
```

- [ ] **Step 2: Create `app/api/cron/publish-due-posts/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { postPublishingQueue } from '@/workers/post-publisher.worker'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const duePosts = await prisma.post.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: new Date() },
    },
    select: { id: true },
  })

  await Promise.all(
    duePosts.map((p) =>
      postPublishingQueue.add(
        'publish-post',
        { postId: p.id },
        {
          jobId: `post-${p.id}`,
          removeOnComplete: true,
        }
      )
    )
  )

  return NextResponse.json({ queued: duePosts.length })
}
```

`jobId: post-{postId}` prevents duplicate jobs if the cron fires while a prior job for the same post is still queued.

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors on either new file.

- [ ] **Step 4: Commit**

```bash
git add workers/post-publisher.worker.ts app/api/cron/publish-due-posts/route.ts
git commit -m "feat: add post-publisher worker and publish-due-posts cron route"
```

---

## Task 6: Worker entry point

**Files:**
- Create: `workers/index.ts`

- [ ] **Step 1: Create `workers/index.ts`**

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
  await Promise.all(workers.map((w) => w.close()))
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('All workers started')
```

Note: `workers/index.ts` uses relative imports (not `@/` alias) because `tsx` runs it as a plain Node.js script, not through Next.js's module resolution. The worker files themselves DO use `@/` aliases because Railway runs the full project via tsx which resolves them via `tsconfig.json` paths.

Wait — actually tsx DOES resolve `@/` path aliases when `tsconfig.json` has the `paths` config. But for the entry point `workers/index.ts`, the relative imports are simpler and more reliable. The worker files import `@/lib/prisma` etc., which tsx resolves via tsconfig.

- [ ] **Step 2: Verify tsconfig resolves `@/` aliases**

Read `tsconfig.json` and confirm it has:
```json
"paths": {
  "@/*": ["./*"]
}
```

If this exists, tsx will resolve `@/lib/redis` as `./lib/redis` etc. correctly.

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: Zero errors across all files.

- [ ] **Step 4: Smoke test the worker locally (optional but recommended)**

Set a temporary `REDIS_URL` pointing to a local or test Redis, plus dummy env vars, then run:

```bash
REDIS_URL=redis://localhost:6379 DATABASE_URL=... npx tsx workers/index.ts
```

Expected output: `All workers started` followed by the four worker log lines. Press Ctrl+C, expected: `Shutting down workers...`.

If no local Redis is available, skip this step — the workers will be tested after Railway deployment.

- [ ] **Step 5: Commit**

```bash
git add workers/index.ts
git commit -m "feat: add workers/index.ts entry point for Railway"
```

---

## Task 7: Railway config + final cleanup

**Files:**
- Create: `railway.toml`

- [ ] **Step 1: Create `railway.toml` at the project root (`lyra/railway.toml`)**

```toml
[deploy]
startCommand = "npx tsx workers/index.ts"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

- [ ] **Step 2: Final type check**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add railway.toml
git commit -m "feat: add railway.toml deployment config for BullMQ workers"
```

- [ ] **Step 4: Push to GitHub**

```bash
git push
```

Confirm Netlify build passes — the build was previously failing because `@/workers/brand-sync.worker` (imported by `app/api/cron/brand-refresh/route.ts`) didn't exist. This is now fixed.

---

## Task 8: Railway setup + cron-job.org

These steps are manual — they cannot be automated.

- [ ] **Step 1: Generate CRON_SECRET**

Run in any terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output. This is `CRON_SECRET`.

- [ ] **Step 2: Create Upstash Redis instance**

1. Go to [upstash.com](https://upstash.com) → Create Database
2. Region: `ap-southeast-1` (Singapore, closest to Supabase)
3. Free tier is sufficient
4. Copy the `REDIS_URL` — it will look like `rediss://:password@hostname.upstash.io:6379`

- [ ] **Step 3: Add env vars to Netlify**

In Netlify dashboard → Site → Environment variables, add:

| Variable | Value |
|---|---|
| `REDIS_URL` | Upstash Redis URL from Step 2 |
| `CRON_SECRET` | Value from Step 1 |

- [ ] **Step 4: Create Railway project**

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select `rich3524-cyber/LYRA` (or wherever the inner `lyra/` repo lives)
3. Root directory: set to `/` (Railway will use the `lyra/` project root)
4. Railway detects `railway.toml` automatically — start command is `npx tsx workers/index.ts`

- [ ] **Step 5: Add env vars to Railway**

In Railway service → Variables, add a full copy of all Netlify env vars, plus:

| Variable | Value |
|---|---|
| `REDIS_URL` | Same Upstash Redis URL |
| `DATABASE_URL` | Supabase pooled URL (port **6543**, with `?pgbouncer=true&connection_limit=1`) |

Note: Railway does NOT need `DIRECT_URL` — workers run normal Prisma queries, not migrations.

- [ ] **Step 6: Confirm Railway deploy succeeds**

In Railway logs, confirm you see:
```
All workers started
```

If you see connection errors for Redis or Postgres, check the env var values.

- [ ] **Step 7: Configure cron-job.org**

Create a free account at [cron-job.org](https://cron-job.org). Create four jobs:

| Title | URL | Schedule | Header |
|---|---|---|---|
| Publish due posts | `https://your-netlify-site.netlify.app/api/cron/publish-due-posts` | Every minute (`* * * * *`) | `Authorization: Bearer <CRON_SECRET>` |
| Sync comments | `https://your-netlify-site.netlify.app/api/cron/sync-comments` | Every 5 min (`*/5 * * * *`) | `Authorization: Bearer <CRON_SECRET>` |
| Sync metrics | `https://your-netlify-site.netlify.app/api/cron/sync-metrics` | Every hour (`0 * * * *`) | `Authorization: Bearer <CRON_SECRET>` |
| Brand refresh | `https://your-netlify-site.netlify.app/api/cron/brand-refresh` | Weekly Sun midnight (`0 0 * * 0`) | `Authorization: Bearer <CRON_SECRET>` |

Replace `your-netlify-site` with your actual Netlify URL.

- [ ] **Step 8: Verify end-to-end**

Manually trigger the publish-due-posts cron from cron-job.org UI. Expected HTTP response: `{ "queued": 0 }` (or a number if you have SCHEDULED posts due). Check Railway logs to confirm the worker process is alive and not crashing.

---

## What is not in this plan

- Live platform API calls for publishing (all platforms are stubbed — LinkedIn pending scope approval, all others pending developer app creation)
- Comment fetching from any platform (all stubs — APIs to be wired per-platform in a future plan)
- The "response poster" step that sends approved AI responses back to platforms
- Any database model changes beyond `lastCommentSyncAt`
