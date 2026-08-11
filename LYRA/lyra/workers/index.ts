// Worker process entry point — starts all BullMQ workers
// Run via: node dist/workers/index.js (after tsc with tsconfig.workers.json)

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
  const drain = Promise.all(workers.map((w) => w.close()))
  await Promise.race([drain, timeout])

  console.log('[workers] Shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
