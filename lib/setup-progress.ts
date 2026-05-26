export interface SetupProgressData {
  percent: number
  milestones: {
    socialConnected: boolean
    brandBuilt: boolean
    postScheduled: boolean
    aiActive: boolean
  }
}

export function computeSetupProgress(ws: {
  aiResponseMode: string
  brandProfile: { voiceSummary: string | null } | null
  _count: { socialAccounts: number; posts: number }
} | null | undefined): SetupProgressData {
  const socialConnected = (ws?._count?.socialAccounts ?? 0) > 0
  const brandBuilt = !!(ws?.brandProfile?.voiceSummary)
  const postScheduled = (ws?._count?.posts ?? 0) > 0
  const aiActive = ws != null && ws.aiResponseMode !== 'OFF'

  const completed = [socialConnected, brandBuilt, postScheduled, aiActive].filter(Boolean).length

  return {
    percent: completed * 25,
    milestones: { socialConnected, brandBuilt, postScheduled, aiActive },
  }
}
