// Worker process entry point — starts all BullMQ workers
// Run via: node dist/workers/index.js (after tsc with tsconfig.workers.json)

import { createServer } from 'http'
import { redisClient } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import postPublisherWorker from './post-publisher.worker'
import commentMonitorWorker from './comment-monitor.worker'
import aiResponderWorker from './ai-responder.worker'
import brandSyncWorker from './brand-sync.worker'
import { competitorMonitorWorker } from './competitor-monitor.worker'
import metricsSyncWorker from './metrics-sync.worker'
import notificationWorker from './notification.worker'

const workers = [
  postPublisherWorker,
  commentMonitorWorker,
  aiResponderWorker,
  brandSyncWorker,
  competitorMonitorWorker,
  metricsSyncWorker,
  notificationWorker,
]

console.log(`[workers] All ${workers.length} workers started`)

// Previously the ONLY signal that this fleet was down was a customer noticing
// nothing published/synced -- app/api/health/route.ts covers the Netlify app's
// DB/Redis connectivity, but this background BullMQ consumer process has no
// HTTP server at all, so nothing could ping it. Unauthenticated by design,
// matching app/api/health/route.ts -- this is what an uptime monitor hits, and
// returns only up/down status, no data. Requires this service's port exposed
// in the Railway dashboard (dashboard-only config, not something this file
// controls) before any external monitor can reach it.
const HEALTH_PORT = Number(process.env.PORT ?? 8080)
const healthServer = createServer((req, res) => {
  if (req.url !== '/health' && req.url !== '/') {
    res.writeHead(404).end()
    return
  }
  Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redisClient.ping().then(() => true).catch(() => false),
  ]).then(([dbOk, redisOk]) => {
    const healthy = dbOk && redisOk
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded', database: dbOk, redis: redisOk, workers: workers.length }))
  })
})
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[workers] Health listener on :${HEALTH_PORT}`)
})

// A deploy-time SIGTERM used to call process.exit(0) immediately, with zero
// drain -- any post mid-publish, comment mid-response, etc. was abandoned
// wherever it happened to be, and nothing in the system ever re-checked a
// post stranded in PUBLISHING state afterward. Worker.close() waits for
// active jobs on that worker to finish (or the timeout below, whichever
// comes first) before resolving, so a routine deploy no longer has a chance
// of corrupting in-flight work.
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[workers] ${signal} received — draining ${workers.length} workers...`)

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 25_000))
  // allSettled, not all -- one worker's close() rejecting must not abandon
  // the other six mid-drain, which is exactly what this whole function
  // exists to prevent.
  const drain = Promise.allSettled(workers.map((w) => w.close())).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') console.error('[workers] a worker failed to close cleanly:', r.reason)
    }
  })
  await Promise.race([drain, timeout])
  await new Promise<void>((resolve) => healthServer.close(() => resolve()))

  console.log('[workers] Shutdown complete')
  process.exit(0)
}

function shutdownOrExit(signal: string) {
  shutdown(signal).catch((err) => {
    console.error(`[workers] shutdown itself threw for ${signal}:`, err)
    process.exit(1)
  })
}

process.on('SIGTERM', () => shutdownOrExit('SIGTERM'))
process.on('SIGINT', () => shutdownOrExit('SIGINT'))

// Without these, an unhandled rejection anywhere in the 7-worker fleet (e.g.
// an async 'failed' event listener throwing -- see post-publisher.worker.ts's
// handlePublishFailure) crashes the process immediately with zero drain, and
// Railway's restartPolicyMaxRetries eventually gives up -- permanently
// stopping ALL publishing/AI-response/sync until a human notices. At minimum,
// attempt the same graceful drain a signal would trigger before exiting.
process.on('unhandledRejection', (reason) => {
  console.error('[workers] FATAL unhandled rejection -- draining and exiting:', reason)
  shutdown('unhandledRejection').finally(() => process.exit(1))
})
process.on('uncaughtException', (err) => {
  console.error('[workers] FATAL uncaught exception -- exiting:', err)
  process.exit(1)
})
