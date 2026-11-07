import { describe, it, expect } from 'vitest'
import { isCronTriggerMode } from './cron-mode'

// This predicate decides whether a Railway container starts the worker fleet
// or fires one cron route and exits. Getting it wrong in the false direction
// stops all background processing; in the true direction it starts a second
// worker fleet on the same queues, which double-publishes to real accounts.
// Hence the explicit cases rather than trusting truthiness.
describe('isCronTriggerMode', () => {
  it('is cron mode when CRON_ROUTE names a route', () => {
    expect(isCronTriggerMode({ CRON_ROUTE: '/api/cron/sync-comments' })).toBe(true)
  })

  it('is fleet mode when CRON_ROUTE is absent — the LYRA service sets no such variable', () => {
    expect(isCronTriggerMode({})).toBe(false)
  })

  // An empty or whitespace variable is what a half-finished dashboard edit
  // leaves behind. Treating it as cron mode would silently stop the fleet
  // and trigger nothing, since trigger.mjs exits 1 on a blank CRON_ROUTE.
  it.each(['', '   ', '\t'])('is fleet mode when CRON_ROUTE is blank (%j)', (route) => {
    expect(isCronTriggerMode({ CRON_ROUTE: route })).toBe(false)
  })

  it('does not consult any other variable', () => {
    expect(isCronTriggerMode({ CRON_SECRET: 's3cret', RAILWAY_SERVICE_NAME: 'cron-sync-metrics' })).toBe(false)
  })
})
