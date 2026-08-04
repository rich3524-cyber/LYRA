import { callLyraApi } from '../lyra-api-client'

interface WorkspaceSummary {
  id: string
  name: string
  industry: string | null
  plan: string
  role: string | null
  platforms: string[]
}

export async function listWorkspaces(_params: Record<string, never>, bearerToken: string) {
  const workspaces = await callLyraApi<WorkspaceSummary[]>('/api/workspaces', bearerToken)
  return { workspaces }
}
