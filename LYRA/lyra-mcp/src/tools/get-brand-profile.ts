import { callLyraApi } from '../lyra-api-client'

interface BrandProfile {
  voiceSummary: string | null
  toneAttributes: string[]
  contentThemes: string[]
  guardrails: { type: string; value: string }[]
}

export async function getBrandProfile(params: { workspace_id: string }, bearerToken: string) {
  if (!params.workspace_id) throw new Error('workspace_id is required')
  const { voiceSummary, toneAttributes, contentThemes, guardrails } = await callLyraApi<BrandProfile>(
    '/api/brand-intelligence/profile',
    bearerToken,
    { workspaceId: params.workspace_id }
  )
  return { voiceSummary, toneAttributes, contentThemes, guardrails }
}
