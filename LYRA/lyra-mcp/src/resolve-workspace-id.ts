import { callLyraApi } from './lyra-api-client'

interface WorkspaceRef {
  id: string
  name: string
}

// Distinct error type for specifically the "caller has access to more than
// one workspace and didn't say which" case -- deliberately NOT thrown for
// the "caller has zero workspaces" case below, which is a different failure
// mode (no access at all, not an ambiguity that specifying workspace_id
// could resolve). Callers that want to degrade gracefully for the ambiguous
// case specifically (e.g. searchCapabilities, whose keyword-matching step
// doesn't actually need a workspace) can catch this class alone and let
// every other failure -- including the zero-workspaces case, an expired
// token, or a network/backend error from the underlying callLyraApi call --
// propagate normally instead of being silently swallowed into a degraded
// response.
export class AmbiguousWorkspaceError extends Error {
  constructor(names: string[]) {
    super(`workspace_id is required: caller has access to multiple workspaces (${names.join(', ')}) -- specify which one`)
    this.name = 'AmbiguousWorkspaceError'
  }
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
  throw new AmbiguousWorkspaceError(workspaces.map((w) => w.name))
}
