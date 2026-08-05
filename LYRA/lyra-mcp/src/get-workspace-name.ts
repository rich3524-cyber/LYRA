import { callLyraApi } from './lyra-api-client'

interface WorkspaceRef {
  id: string
  name: string
}

// Only used by the 3 write tools (draft_post, schedule_post,
// respond_to_item), per the parent spec's 6.2 wrong-workspace-write
// mitigation -- read tools don't need this echo-back property, so this
// isn't wired into resolveWorkspaceId itself (which every workspace-scoped
// tool uses) to avoid adding an extra API call to the 6 read tools that
// don't need it.
export async function getWorkspaceName(workspaceId: string, bearerToken: string): Promise<string | null> {
  const workspaces = await callLyraApi<WorkspaceRef[]>('/api/workspaces', bearerToken)
  return workspaces.find((w) => w.id === workspaceId)?.name ?? null
}
