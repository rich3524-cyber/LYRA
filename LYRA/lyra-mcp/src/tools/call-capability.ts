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

export class CapabilityInvalidParamsError extends Error {
  constructor(name: string, details: string) {
    super(`Invalid params for "${name}": ${details}`)
    this.name = 'CapabilityInvalidParamsError'
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
  // Object.hasOwn (not a truthy check on CAPABILITY_REGISTRY[params.name]) --
  // params.name is fully LLM-controlled, and a plain object literal returns a
  // truthy function for reserved property names like '__proto__', 'constructor',
  // 'toString', 'hasOwnProperty', which would skip the not-found guard below
  // and crash later with an unhelpful TypeError instead of CapabilityNotFoundError.
  if (!Object.hasOwn(CAPABILITY_REGISTRY, params.name)) throw new CapabilityNotFoundError(params.name)
  const capability = CAPABILITY_REGISTRY[params.name]

  const parsed = capability.paramSchema.safeParse(params.params ?? {})
  if (!parsed.success) {
    throw new CapabilityInvalidParamsError(
      params.name,
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    )
  }

  const workspaceId = await resolveWorkspaceId(params.workspace_id, bearerToken)

  const allowed = await meetsPlanTier(workspaceId, capability.minPlanTier, bearerToken)
  if (!allowed) throw new CapabilityAccessDeniedError(params.name, capability.minPlanTier)

  const { path, rest } = substitutePathParams(capability.endpoint, parsed.data as Record<string, unknown>)

  // 'derived-from-path' capabilities operate on a resource id already in the
  // path -- the backend route derives the workspace from that resource, so
  // workspaceId is not merged into the outgoing call. 'explicit' capabilities
  // have no such resource id in the path and need workspaceId added
  // explicitly to scope the request. See the workspaceScoping field's doc
  // comment in registry.ts for the known gap this doesn't close (no
  // backend-side check that the resource's real workspace matches the
  // claimed workspace_id) and why closing it is out of scope here.
  const scopedRest = capability.workspaceScoping === 'derived-from-path' ? rest : { workspaceId, ...rest }

  if (capability.method === 'GET') {
    // callLyraApi's queryParams type is Record<string, string> -- every field
    // left over after path substitution must already be string-typed for a
    // GET capability (true for every v1 registry entry: `month` etc.).
    return callLyraApi(path, bearerToken, scopedRest as Record<string, string>)
  }
  if (capability.method === 'DELETE') {
    // deleteLyraApi sends no request body, so any leftover field here would
    // be silently dropped rather than sent -- fail loudly instead. Harmless
    // today (remove_competitor's only param, id, is fully consumed by path
    // substitution) but guards against a future DELETE capability whose
    // params aren't fully consumed by its :placeholder(s).
    if (Object.keys(rest).length > 0) {
      throw new Error(
        `Capability "${params.name}" is DELETE but has unconsumed params: ${Object.keys(rest).join(', ')}. deleteLyraApi does not support a body.`
      )
    }
    return deleteLyraApi(path, bearerToken)
  }
  return postLyraApi(path, bearerToken, scopedRest)
}
