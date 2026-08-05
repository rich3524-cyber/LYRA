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
    throw new Error(`Refused by guardrail: ${result.rule} - ${result.value}`)
  }

  return result
}
