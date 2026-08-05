import { postLyraApi } from './lyra-api-client'

interface AuditEventParams {
  workspaceId: string
  toolName: string
  params: unknown
  outcome: 'SUCCESS' | 'ERROR'
  errorMessage?: string
}

// Fire-and-forget from the caller's perspective: a failure to WRITE an
// audit log entry must never break the actual tool call it's describing.
// Errors here are only ever logged, never thrown. Safe to run to
// completion even when not awaited by the caller -- this gateway runs as a
// persistent Railway service (not a serverless function that might
// terminate the moment a response is sent), so the event loop keeps
// running until this promise settles regardless.
export async function logAuditEvent(bearerToken: string, event: AuditEventParams): Promise<void> {
  try {
    await postLyraApi('/api/mcp/audit', bearerToken, event)
  } catch (err) {
    console.error('[logAuditEvent] failed to write audit log entry:', err)
  }
}
