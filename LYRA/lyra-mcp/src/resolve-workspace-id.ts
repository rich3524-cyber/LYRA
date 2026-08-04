import { callLyraApi } from './lyra-api-client'

interface WorkspaceRef {
  id: string
  name: string
}

// Per the design spec (docs/superpowers/specs/2026-08-04-mcp-gateway-phase1-design.md
// and the parent spec LYRA/docs/LYRA-mcp-server-design.md §3.1): where a caller
// has exactly one workspace, workspace_id may be omitted and is resolved
// implicitly. Where they have more than one, it's required on every call --
// no implicit default, no "last used". Used by every workspace-scoped tool
// except list_workspaces itself (which has no workspace_id param to resolve).
export async function resolveWorkspaceId(
  workspaceId: string | undefined,
  bearerToken: string
): Promise<string> {
  if (workspaceId) return workspaceId

  const workspaces = await callLyraApi<WorkspaceRef[]>('/api/workspaces', bearerToken)

  if (workspaces.length === 0) {
    throw new Error('workspace_id is required: caller has no workspaces')
  }
  if (workspaces.length === 1) {
    return workspaces[0].id
  }
  const names = workspaces.map((w) => w.name).join(', ')
  throw new Error(
    `workspace_id is required: caller has access to multiple workspaces (${names}) -- specify which one`
  )
}
