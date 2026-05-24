import brandSyncWorker from './brand-sync.worker'
import postPublisherWorker from './post-publisher.worker'
import commentMonitorWorker from './comment-monitor.worker'
import aiResponderWorker from './ai-responder.worker'

console.log('[workers] All workers started')

async function shutdown(signal: string) {
  console.log(`[workers] ${signal} received — closing workers`)
  await Promise.all([
    brandSyncWorker.close(),
    postPublisherWorker.close(),
    commentMonitorWorker.close(),
    aiResponderWorker.close(),
  ])
  console.log('[workers] All workers closed')
  process.exit(0)
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((err) => {
    console.error('[workers] Shutdown error:', err)
    process.exit(1)
  })
})
process.on('SIGINT', () => {
  shutdown('SIGINT').catch((err) => {
    console.error('[workers] Shutdown error:', err)
    process.exit(1)
  })
})
