import { callLyraApi, postLyraApi, deleteLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { meetsPlanTier } from '../capabilities/plan-tier'
import { CAPABILITY_REGISTRY } from '../capabilities/registry'
import { wrapUntrusted } from '../untrusted-content'
import { getWorkspaceName } from '../get-workspace-name'

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

  let result: unknown
  if (capability.method === 'GET') {
    // callLyraApi's queryParams type is Record<string, string> -- every field
    // left over after path substitution must already be string-typed for a
    // GET capability (true for every v1 registry entry: `month` etc.).
    result = await callLyraApi(path, bearerToken, scopedRest as Record<string, string>)
  } else if (capability.method === 'DELETE') {
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
    result = await deleteLyraApi(path, bearerToken)
  } else {
    result = await postLyraApi(path, bearerToken, scopedRest)
  }

  // §6.1: wrap third-party content generically, based on the manifest flag.
  // Checked before the §6.2 echo-back below and returns early -- for a
  // capability flagged both `mutates` and `wrapsUntrustedContent` (e.g.
  // analyze_seo_page, whose response embeds scraped third-party HTML), this
  // means the wrap wins and the workspace-name echo-back is genuinely lost
  // for that response, not just deferred or covered elsewhere. In particular,
  // resolveWorkspaceId does NOT validate an explicitly-supplied workspace_id
  // -- `if (workspaceId) return workspaceId` returns it verbatim, with no
  // check that the caller actually has access to it -- so for a
  // 'derived-from-path' capability like analyze_seo_page (whose backend route
  // authorizes by "does this user have access to *any* workspace containing
  // this resource," not by the claimed workspace_id -- see registry.ts's
  // workspaceScoping doc comment), the echo-back is currently the ONLY
  // wrong-workspace signal anywhere in this call, and it's the one being
  // dropped here. This is a deliberate priority call (untrusted content
  // reaching the model unmarked is a prompt-injection vector, judged worse
  // than a missing echo-back), not a claim that the loss is harmless. A
  // capability needing both properties without losing the echo-back should
  // be revisited to nest the two shapes instead of short-circuiting.
  if (capability.wrapsUntrustedContent) {
    // `params.name` is fully LLM-controlled and gets interpolated unescaped
    // into the wrapper's attribute (see wrapUntrusted's doc comment) -- safe
    // here only because the Object.hasOwn(CAPABILITY_REGISTRY, params.name)
    // guard near the top of this function already constrains it to one of
    // the registry's own literal keys. If that guard is ever relaxed or
    // moved, this interpolation reopens attribute injection into the
    // trust-boundary tag.
    // JSON.stringify can return the JS value `undefined` (not a string) --
    // TypeScript's lib types lie about this -- which would otherwise reach
    // wrapUntrusted's `.replace()` and throw. Not reachable today (only a
    // DELETE capability's client can return undefined, and none of those are
    // flagged wrapsUntrustedContent), but guarded anyway for the same reason
    // the DELETE unconsumed-params check above guards its own future-entry hazard.
    return { wrapped: wrapUntrusted(JSON.stringify(result) ?? 'null', `${params.name}_data`) }
  }

  // §6.2: echo back the workspace name for every mutating capability, so a
  // misresolved workspace is visible immediately -- applied generically here
  // rather than requiring every future capability addition to remember it,
  // matching how draft_post/schedule_post already do this via
  // getWorkspaceName (best-effort: never fails the call over a missing name).
  if (capability.mutates) {
    const workspaceName = await getWorkspaceName(workspaceId, bearerToken)
    return { workspaceName, result }
  }

  return result
}
