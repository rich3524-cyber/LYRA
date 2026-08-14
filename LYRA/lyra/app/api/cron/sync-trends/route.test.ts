import { describe, it, expect } from 'vitest'
import { GET } from './route'

// LYRA Trend is not built yet -- this route is a Phase 3 placeholder stub.
// Unlike its 5 sibling cron routes it does NOT call checkCronAuth and takes no
// database action, so the standard auth-rejection / happy-path / take-cap /
// partial-failure test shape does not apply here. See report: this route is
// reachable with no Authorization header at all, which is fine today only
// because it touches nothing -- if real logic is ever added under this route
// without also adding the checkCronAuth gate its 5 siblings all have, it
// becomes an unauthenticated cron endpoint.
describe('GET /api/cron/sync-trends', () => {
  it('responds with the Phase 3 placeholder body and requires no authorization', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 0, note: 'LYRA Trend launches in Phase 3.' })
  })
})
