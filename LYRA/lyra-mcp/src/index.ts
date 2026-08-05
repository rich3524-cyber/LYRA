import { createApp } from './http'

// Fail fast on a missing required env var rather than starting "successfully"
// and silently misbehaving: a forgotten APP_BASE_URL interpolates as the
// literal string "undefined" into the RFC 9728 metadata document and the
// WWW-Authenticate header (breaking OAuth discovery for every MCP client
// with no server-side error signal), missing AUTH0_DOMAIN/AUTH0_MCP_AUDIENCE
// degrades to generic 401s on every request, missing LYRA_API_BASE_URL
// produces an opaque "Invalid URL" error on every tool call, and missing
// REDIS_URL doesn't error at all -- ioredis silently targets localhost:6379,
// so every rate-limited tool call hangs for several seconds before failing.
// /health would still report 200 throughout, so Railway's own health check
// wouldn't catch any of this either -- an immediate crash-loop with a clear
// log line is far preferable.
const REQUIRED_ENV_VARS = ['AUTH0_DOMAIN', 'AUTH0_MCP_AUDIENCE', 'LYRA_API_BASE_URL', 'APP_BASE_URL', 'REDIS_URL']

function assertRequiredEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name])
  if (missing.length > 0) {
    console.error(`[lyra-mcp] Missing required environment variable(s): ${missing.join(', ')}`)
    process.exit(1)
  }
}

assertRequiredEnvVars()

const port = Number(process.env.PORT) || 3100
const app = createApp()
const server = app.listen(port, () => {
  console.log(`lyra-mcp listening on port ${port}`)
})

// A deploy-time SIGTERM used to hard-kill the process immediately, abandoning
// any in-flight /mcp request (e.g. mid-flight LYRA API call) wherever it
// happened to be. server.close() stops accepting new connections but lets
// in-flight requests finish (or the timeout below, whichever comes first)
// before exiting -- mirrors the drain-on-shutdown convention already
// established for the worker fleet in LYRA/lyra/workers/index.ts, adapted
// for an HTTP server (server.close() draining connections) rather than a
// BullMQ job queue (Worker.close() draining jobs).
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[lyra-mcp] ${signal} received — draining in-flight requests...`)

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 25_000))
  const drain = new Promise<void>((resolve) => server.close(() => resolve()))
  await Promise.race([drain, timeout])

  console.log('[lyra-mcp] Shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
