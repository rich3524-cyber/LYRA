// Worker process entry point — starts all BullMQ workers
// Run via: npx tsx workers/index.ts

import postWorker from './post-publisher.worker'
import commentWorker from './comment-monitor.worker'
import aiWorker from './ai-responder.worker'
import brandWorker from './brand-sync.worker'
import { competitorMonitorWorker } from './competitor-monitor.worker'
import { aiVisibilityWorker } from './ai-visibility.worker'
import { trendSyncWorker } from './trend-sync.worker'
import { redis } from '@/lib/redis'

const workers = [postWorker, commentWorker, aiWorker, brandWorker, competitorMonitorWorker, aiVisibilityWorker, trendSyncWorker]

console.log('[workers] All workers started')

async function shutdown(signal: string) {
  console.log(`[workers] ${signal} received — closing workers gracefully`)
  await Promise.allSettled(workers.map(w => w.close()))
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
