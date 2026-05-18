export interface SocialInsights {
  totalPosts:     number
  avgPostLength:  number
  topThemes:      string[]
  commonHashtags: string[]
  toneIndicators: string[]
}

export function analyzeSocialPosts(posts: string[]): SocialInsights {
  if (posts.length === 0) {
    return { totalPosts: 0, avgPostLength: 0, topThemes: [], commonHashtags: [], toneIndicators: [] }
  }

  const avgPostLength = Math.round(
    posts.reduce((sum, p) => sum + p.length, 0) / posts.length
  )

  // Extract hashtags
  const hashtagCounts: Record<string, number> = {}
  for (const post of posts) {
    const tags = post.match(/#[\w]+/g) ?? []
    for (const tag of tags) {
      const t = tag.toLowerCase()
      hashtagCounts[t] = (hashtagCounts[t] ?? 0) + 1
    }
  }
  const commonHashtags = Object.entries(hashtagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag]) => tag)

  // Simple tone detection via keyword presence
  const allText = posts.join(' ').toLowerCase()
  const toneIndicators: string[] = []
  if (/exciting|thrilled|amazing|love|🎉|🚀/.test(allText)) toneIndicators.push('enthusiastic')
  if (/tip|learn|guide|how to|discover/.test(allText)) toneIndicators.push('educational')
  if (/we|our|us|team|community/.test(allText)) toneIndicators.push('community-focused')
  if (/offer|sale|discount|limited|now/.test(allText)) toneIndicators.push('promotional')
  if (/question|what do you|how do you|tell us/.test(allText)) toneIndicators.push('conversational')

  return {
    totalPosts:    posts.length,
    avgPostLength,
    topThemes:     [],
    commonHashtags,
    toneIndicators,
  }
}
