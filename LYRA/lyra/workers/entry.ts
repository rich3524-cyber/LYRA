// Single entry point for every Railway service deployed from this repo.
//
// Dispatches on CRON_ROUTE (see ./cron-mode): the five cron-* services fire
// their route once and exit, everything else starts the worker fleet. Kept
// deliberately thin, and ./index is left untouched, so the fleet's startup
// path is byte-for-byte what it was before this file existed.
//
// Both imports are dynamic and the branch is taken before either runs. That
// ordering is the whole point: ./index pulls in lib/prisma and lib/redis at
// module scope, and lib/redis throws when REDIS_URL is unset -- which is
// correct for the fleet and wrong for a cron trigger, since
// scripts/cron/trigger.mjs needs no Redis at all.
import { isCronTriggerMode } from './cron-mode'

async function main(): Promise<void> {
  if (isCronTriggerMode()) {
    // trigger.mjs does its work at module scope and sets a non-zero exit
    // code itself on failure, so importing it is the whole invocation. The
    // process then exits naturally once the event loop drains, which is what
    // a Railway cron service expects -- it must not stay running.
    await import('../scripts/cron/trigger.mjs')
    return
  }

  await import('./index')
}

main().catch((err) => {
  console.error('[entry] failed to start:', err)
  process.exit(1)
})
