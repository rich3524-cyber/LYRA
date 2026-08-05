import { postLyraApi } from './lyra-api-client'

export interface AuditEventParams {
  workspaceId: string
  toolName: string
  params: unknown
  outcome: 'SUCCESS' | 'ERROR'
  errorMessage?: string
}

// The backend's own POST /api/mcp/audit endpoint enforces these same caps
// and 400s (silently dropping the row) if either is exceeded -- which is
// exactly backwards for an ERROR-outcome row, the one you most want
// recorded. Truncate here so an oversized errorMessage or params blob
// never causes the audit write itself to be rejected.
const MAX_ERROR_MESSAGE_LENGTH = 2000
const MAX_PARAMS_SERIALIZED_LENGTH = 50_000

function capParams(params: unknown): unknown {
  try {
    const serialized = JSON.stringify(params)
    if (serialized && serialized.length > MAX_PARAMS_SERIALIZED_LENGTH) {
      return { truncated: true, originalLength: serialized.length }
    }
    return params
  } catch {
    return params
  }
}

// Fire-and-forget from the caller's perspective: a failure to WRITE an
// audit log entry must never break the actual tool call it's describing.
// Errors here are only ever logged, never thrown. Safe to run to
// completion even when not awaited by the caller -- this gateway runs as a
// persistent Railway service (not a serverless function that might
// terminate the moment a response is sent), so the event loop keeps
// running until this promise settles regardless of whether the caller
// awaited it.
//
// One known gap: index.ts's SIGTERM handler drains in-flight *HTTP
// requests* (via server.close()) before calling process.exit(0), but a
// `void logAuditEvent(...)` fired just before a tool-call response is sent
// is not itself tracked as an in-flight HTTP request by server.close() --
// so it's possible for the process to exit mid-write on a deploy,
// dropping a small number of audit rows. Acceptable for beta scope; not
// worth the complexity of explicit in-flight-write tracking to close.
export async function logAuditEvent(bearerToken: string, event: AuditEventParams): Promise<void> {
  const cappedEvent = {
    ...event,
    errorMessage: event.errorMessage?.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    params: capParams(event.params),
  }

  try {
    await postLyraApi('/api/mcp/audit', bearerToken, cappedEvent)
  } catch (err) {
    console.error(
      `[logAuditEvent] failed to write audit log entry (workspace=${event.workspaceId} tool=${event.toolName} outcome=${event.outcome}):`,
      err
    )
  }
}
