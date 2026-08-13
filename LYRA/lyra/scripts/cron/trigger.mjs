// Fires one LYRA /api/cron/* route and exits. Meant to run as a Railway
// service with a Deploy > Cron Schedule set (Settings > Deploy) -- Railway
// runs this once per tick and expects it to exit, not stay running.
//
// One shared script rather than five near-identical ones: the only thing
// that differs between LYRA's five cron jobs is which route to hit, so
// that's the one thing set per-service (the CRON_ROUTE variable), not
// duplicated in five separate files that would drift out of sync with each
// other over time.
//
// Replaces cron-job.org as the trigger for these routes -- the routes
// themselves (auth via CRON_SECRET, the actual work) are unchanged. See
// LYRA-Handover.md's cron-reliability entry for why: cron-job.org has
// silently auto-disabled jobs more than once with no alerting, which
// Railway's own deploy history/logs make visible instead.

const route = process.env.CRON_ROUTE
const secret = process.env.CRON_SECRET
const baseUrl = process.env.APP_BASE_URL ?? 'https://lyraonline.ai'

if (!route) {
  console.error('CRON_ROUTE is not set on this service -- nothing to trigger.')
  process.exit(1)
}
if (!secret) {
  console.error('CRON_SECRET is not set on this service.')
  process.exit(1)
}

const url = `${baseUrl}${route}`

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log(`${route} -> ${res.status}`)
  if (body) console.log(body)

  if (!res.ok) {
    console.error(`${route} returned a non-2xx status.`)
    process.exit(1)
  }
} catch (err) {
  console.error(`${route} request failed:`, err)
  process.exit(1)
}
