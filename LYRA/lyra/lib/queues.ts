import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'

// Canonical Queue instances for queue names that get `.add()`-ed from more than
// one file (a serverless route AND a worker file, typically). Deliberately NOT
// re-exported from the corresponding workers/*.worker.ts file -- importing a
// *.worker.ts file from a serverless API route would pull in that file's
// `new Worker(...)` call as a side effect, starting a second BullMQ consumer
// inside the Netlify function instead of just getting a Queue to add() to.
// defaultJobOptions only takes effect for the Queue instance that calls
// .add(), so every producer of a given queue name needs to import the *same*
// instance for these retry/retention settings to actually apply -- a second,
// separately-declared `new Queue(sameName, {})` with no options silently
// produces jobs with none of them.

export const aiRespondQueue = new Queue('ai-responding', {
  connection: redis,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
  },
})

export const commentMonitorQueue = new Queue('comment-monitoring', {
  connection: redis,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
  },
})

export const brandSyncQueue = new Queue('brand-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts:         2,
    backoff:          { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail:     { count: 20 },
  },
})

// Channel notifications (Slack today, Teams later). Queued rather than sent
// inline because every trigger site is either a serverless route or a worker
// mid-transaction, and none of them should block on -- or be failed by -- an
// outbound Zernio call. Retries are deliberately few: a crisis alert that
// finally lands 20 minutes late is close to worthless, and the crisis email
// remains the baseline delivery path regardless.
export const notificationQueue = new Queue('notification-delivery', {
  connection: redis,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
  },
})

// One job per post, fanned out from app/api/cron/sync-metrics/route.ts instead of that
// route fetching all ~200 posts' analytics sequentially inline -- the inline version risked
// exceeding Netlify's function duration ceiling on any workspace with real publishing
// volume. The worker processes these concurrently (see metrics-sync.worker.ts).
export const metricsSyncQueue = new Queue('metrics-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts:         2,
    backoff:          { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
  },
})
