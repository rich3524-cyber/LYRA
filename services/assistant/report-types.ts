export interface PerformancePeriod {
  from: string
  to: string
  label: string
}

export interface PlatformPerformance {
  platform: string
  postCount: number
  avgEngagementRate: number
  topPostId: string | null
}

export interface StrategyKeyDate {
  date: string
  name: string
  campaignIdea: string
}

export interface StrategyFrequency {
  platform: string
  postsPerWeek: number
}

export interface StrategyMonth {
  month: string
  contentPillars: string[]
  keyDates: StrategyKeyDate[]
  recommendedFrequency: StrategyFrequency[]
}

export interface ReportPerformance {
  totalPosts: number
  avgEngagementRate: number
  bestPlatform: string | null
  topContentTheme: string | null
  byPlatform: PlatformPerformance[]
  insightNarrative: string
}

export interface ReportData {
  period: PerformancePeriod
  performance: ReportPerformance
  strategy: {
    months: StrategyMonth[]
  }
}

export interface ReportMetrics {
  totalPosts: number
  avgEngagementRate: number
  bestPlatform: string | null
  topContentTheme: string | null
  byPlatform: PlatformPerformance[]
}
