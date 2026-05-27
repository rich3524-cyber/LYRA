export interface PostingSlot {
  dayOfWeek: number
  hour: number
  score: number
}

export interface PlatformPattern {
  topSlots: PostingSlot[]
  byTopic: Record<string, PostingSlot[]>
  totalPostsAnalyzed: number
  analyzedAt: string
}

export type PostingPatterns = Record<string, PlatformPattern>

export async function analyzeEngagement(_workspaceId: string): Promise<PostingPatterns | null> {
  throw new Error('Engagement analysis not available')
}
