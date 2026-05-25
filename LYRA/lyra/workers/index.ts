// Worker process entry point — starts all BullMQ workers
// Run via: node dist/workers/index.js (after tsc with tsconfig.workers.json)

import './post-publisher.worker'
import './comment-monitor.worker'
import './ai-responder.worker'
import './brand-sync.worker'
import './competitor-monitor.worker'

console.log('[workers] All workers started')

process.on('SIGTERM', () => {
  console.log('[workers] SIGTERM received — shutting down gracefully')
  process.exit(0)
})
