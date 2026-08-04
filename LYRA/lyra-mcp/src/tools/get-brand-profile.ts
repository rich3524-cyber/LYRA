import { callLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface BrandProfile {
  voiceSummary: string | null
  toneAttributes: string[]
  contentThemes: string[]
  guardrails: { type: string; value: string }[]
}

export async function getBrandProfile(params: { workspace_id?: string }, bearerToken: string) {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)
  const { voiceSummary, toneAttributes, contentThemes, guardrails } = await callLyraApi<BrandProfile>(
    '/api/brand-intelligence/profile',
    bearerToken,
    { workspaceId: workspace_id }
  )
  return { voiceSummary, toneAttributes, contentThemes, guardrails }
}
