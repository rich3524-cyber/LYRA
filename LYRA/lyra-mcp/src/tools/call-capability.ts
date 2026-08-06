import { callLyraApi, postLyraApi, deleteLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { CAPABILITY_REGISTRY } from '../capabilities/registry'

interface CallCapabilityParams {
  name: string
  params: unknown
  workspace_id?: string
}

export class CapabilityNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown capability: "${name}". Use search_capabilities to find a valid name.`)
    this.name = 'CapabilityNotFoundError'
  }
}

export class CapabilityAccessDeniedError extends Error {
  constructor(name: string, minPlanTier: string) {
    super(`"${name}" requires the ${minPlanTier} plan or higher.`)
    this.name = 'CapabilityAccessDeniedError'
  }
}

// Substitutes every `:placeholder` in `endpoint` with the matching field from
// `params`, returning the resolved path plus a copy of `params` with those
// fields removed -- the remainder is what's left over for the query string
// (GET) or body (POST/DELETE). A capability whose endpoint has no
// placeholders (the common case) returns `params` untouched.
function substitutePathParams(endpoint: string, params: Record<string, unknown>): { path: string; rest: Record<string, unknown> } {
  const rest = { ...params }
  const path = endpoint.replace(/:(\w+)/g, (_match, key: string) => {
    const value = rest[key]
    delete rest[key]
    return encodeURIComponent(String(value))
  })
  return { path, rest }
}

export async function callCapability(params: CallCapabilityParams, bearerToken: string): Promise<unknown> {
  const capability = CAPABILITY_REGISTRY[params.name]
  if (!capability) throw new CapabilityNotFoundError(params.name)

  const parsed = capability.paramSchema.safeParse(params.params ?? {})
  if (!parsed.success) {
    throw new Error(`Invalid params for "${params.name}": ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`)
  }

  const workspaceId = await resolveWorkspaceId(params.workspace_id, bearerToken)

  const allowed = await meetsPlanTier(workspaceId, capability.minPlanTier, bearerToken)
  if (!allowed) throw new CapabilityAccessDeniedError(params.name, capability.minPlanTier)

  const { path, rest } = substitutePathParams(capability.endpoint, parsed.data as Record<string, unknown>)

  // When the endpoint has a `:placeholder` (e.g. /api/seo/pages/:pageId/analyze),
  // the resource is already workspace-scoped by the id in the path -- the backend
  // route resolves the workspace from that resource, so workspaceId is not merged
  // into the outgoing call. Only endpoints with no path params (e.g. /api/competitors)
  // need workspaceId added explicitly to scope the request.
  const hasPathParam = /:\w+/.test(capability.endpoint)
  const scopedRest = hasPathParam ? rest : { workspaceId, ...rest }

  if (capability.method === 'GET') {
    // callLyraApi's queryParams type is Record<string, string> -- every field
    // left over after path substitution must already be string-typed for a
    // GET capability (true for every v1 registry entry: `month` etc.).
    return callLyraApi(path, bearerToken, scopedRest as Record<string, string>)
  }
  if (capability.method === 'DELETE') {
    return deleteLyraApi(path, bearerToken)
  }
  return postLyraApi(path, bearerToken, scopedRest)
}
