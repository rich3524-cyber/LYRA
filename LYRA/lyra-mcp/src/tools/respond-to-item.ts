import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface RespondToItemParams {
  workspace_id?: string
  comment_id: string
  response_text?: string
}

interface RespondResult {
  sent: boolean
  draft?: string
  response?: string
  shouldEscalate?: boolean
  escalationReason?: string
  refused?: boolean
  rule?: string
  value?: string
  // Echoed back by the backend on every response shape (parent spec 6.2:
  // every write echoes workspace name, platform, and account handle so a
  // misresolution is visible immediately). Unlike draft_post/schedule_post,
  // this tool doesn't call getWorkspaceName itself to produce these --
  // the backend endpoint already has comment.socialAccount/.workspace loaded
  // and supplies them directly, so they just pass through unchanged below.
  workspaceName?: string
  platform?: string
  accountName?: string
}

// Mirrors the LyraApiError/LyraApiTimeoutError/LyraApiNetworkError
// convention in lyra-api-client.ts -- gives future code (e.g. audit
// logging) a typed way to detect and handle a guardrail refusal distinctly,
// without changing what the calling model sees today (same message text).
export class GuardrailRefusalError extends Error {
  rule?: string
  value?: string
  constructor(rule: string | undefined, value: string | undefined) {
    super(`Refused by guardrail: ${rule ?? 'unknown rule'} - ${value ?? 'unknown value'}`)
    this.name = 'GuardrailRefusalError'
    this.rule = rule
    this.value = value
  }
}

export async function respondToItem(params: RespondToItemParams, bearerToken: string) {
  // Resolved even though the backend endpoint doesn't need workspace_id to
  // find the comment (it's already scoped via the comment's own access
  // check) -- still required here for the parent spec's 6.2 disambiguation
  // safety property (workspace_id required explicitly whenever the caller
  // has more than one workspace, no implicit "last used").
  await resolveWorkspaceId(params.workspace_id, bearerToken)

  const result = await postLyraApi<RespondResult>('/api/mcp/respond-to-item', bearerToken, {
    commentId: params.comment_id,
    responseText: params.response_text,
  })

  // Structured refusal per the parent spec's response-design convention --
  // surfaces as a real MCP tool error naming the rule that fired, not a
  // silent partial success, so the calling model can explain the block.
  if (result.refused) {
    throw new GuardrailRefusalError(result.rule, result.value)
  }

  // Judgment call: result.draft/result.response is NOT run through
  // wrapUntrusted (unlike list-inbox-items.ts's comment.content). It's
  // AI-generated text that already passed checkGuardrailViolation/
  // checkAlwaysEscalate server-side, not raw third-party content -- so it's
  // categorically different from what list_inbox_items wraps. Reconsider if
  // this tool ever starts passing through unmoderated caller text unchanged.
  return result
}
