import { callLyraApi } from './lyra-api-client'

interface WorkspaceRef {
  id: string
  name: string
}

// Only used by 2 of the 3 write tools -- draft_post and schedule_post --
// per the parent spec's 6.2 wrong-workspace-write mitigation -- read tools
// don't need this echo-back property, so this isn't wired into
// resolveWorkspaceId itself (which every workspace-scoped tool uses) to
// avoid adding an extra API call to the 6 read tools that don't need it.
// The third write tool, respond_to_item, satisfies the same 6.2 property
// without calling this function: its backend endpoint already has
// comment.socialAccount/.workspace loaded and echoes workspaceName/platform/
// accountName directly in its response, so there's nothing for this
// function to add there.
export async function getWorkspaceName(workspaceId: string, bearerToken: string): Promise<string | null> {
  try {
    const workspaces = await callLyraApi<WorkspaceRef[]>('/api/workspaces', bearerToken)
    return workspaces.find((w) => w.id === workspaceId)?.name ?? null
  } catch {
    return null // echo-back is best-effort; never fail a write over a missing display name
  }
}
