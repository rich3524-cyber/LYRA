/**
 * Whether this container should act as a one-shot cron trigger rather than
 * the long-running BullMQ worker fleet.
 *
 * Railway reads one shared railway.toml for every service deployed from this
 * repo, and that file's startCommand is config-as-code owned -- the
 * dashboard's Custom Start Command field is locked whenever it is set, so a
 * per-service override is not available. That is why the 2026-08-13
 * "cron jobs migrated from cron-job.org to Railway" change never actually
 * took effect: all five cron-* services inherited `npx tsx workers/index.ts`
 * and started worker fleets instead of firing their route, so not one of
 * them ever made an HTTP request to the app. Confirmed 2026-11-06.
 *
 * CRON_ROUTE is the natural discriminator because it is already set on
 * exactly the five cron services and on none of the others -- no new
 * configuration anywhere, and the decision lives in the repo rather than in
 * five dashboard fields nobody will remember to check.
 */
// Takes a plain string map rather than NodeJS.ProcessEnv: this project
// augments ProcessEnv with required keys, so that type cannot be satisfied
// by the small literals a test needs to express one variable at a time.
export function isCronTriggerMode(env: Record<string, string | undefined> = process.env): boolean {
  const route = env.CRON_ROUTE
  return typeof route === 'string' && route.trim() !== ''
}
