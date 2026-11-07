/**
 * A BullMQ job id scoped to a schedule tick rather than to an entity forever.
 *
 * BullMQ silently no-ops `add()` when the job id already exists in ANY state,
 * and a queue that retains failures (every queue here sets
 * removeOnFail: { count: 100 }) keeps a failed id occupied indefinitely. So a
 * permanently stable id like `monitor-${accountId}` is a one-way door: the
 * first tick that exhausts its attempts parks that id in the failed set, and
 * every tick afterwards returns the existing job and enqueues nothing. The
 * route still answers 200 with { queued: 10 } because add() itself succeeded.
 *
 * That is how comment ingestion died. Confirmed 2026-11-07: cron firing
 * cleanly every tick, worker fleet healthy on the same Upstash database,
 * zero errors anywhere, and not one account synced since 24 August.
 *
 * Suffixing with a time window keeps the original purpose of a stable id --
 * two ticks inside the same window still collapse to one job, which also
 * de-duplicates cron-job.org and Railway firing the same route in parallel
 * during the migration -- while guaranteeing the id eventually moves on.
 * workers/competitor-monitor.worker.ts already does this with a `-${today}`
 * suffix; this is the same idea with a window that suits sub-daily jobs.
 */
export function tickScopedJobId(
  prefix: string,
  windowMs: number = 5 * 60_000,
  now: number = Date.now()
): string {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(`tickScopedJobId: windowMs must be a positive number, got ${windowMs}`)
  }
  return `${prefix}-${Math.floor(now / windowMs)}`
}
