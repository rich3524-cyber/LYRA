import { callLyraApi } from '../lyra-api-client'

interface WorkspaceDetail {
  id: string
  name: string
  aiResponseMode: string
  plan: string
}

export async function getWorkspaceOverview(params: { workspace_id: string }, bearerToken: string) {
  if (!params.workspace_id) throw new Error('workspace_id is required')
  const { workspace_id } = params

  const [workspace, pendingPosts, inbox, crisis] = await Promise.all([
    callLyraApi<WorkspaceDetail>(`/api/workspaces/${workspace_id}`, bearerToken),
    callLyraApi<unknown[]>('/api/posts', bearerToken, { workspaceId: workspace_id, status: 'PENDING_APPROVAL' }),
    callLyraApi<{ count: number }>('/api/comments/unread-count', bearerToken, { workspaceId: workspace_id }),
    callLyraApi<{ crisisActive: boolean }>('/api/crisis/status', bearerToken, { workspaceId: workspace_id }),
  ])

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      autonomyMode: workspace.aiResponseMode,
      plan: workspace.plan,
    },
    pendingApprovalsCount: pendingPosts.length,
    inboxPendingCount: inbox.count,
    crisisActive: crisis.crisisActive,
  }
}
