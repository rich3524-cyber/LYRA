import { SectionHeader, Subsection, Strong, MetricRow } from './primitives'

export function AnalyticsSection() {
  return (
    <section id="analytics" className="space-y-8 scroll-mt-28">
      <SectionHeader n="09" title="Analytics" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The analytics dashboard aggregates performance data from all connected social platforms
        for the active workspace into a single view. Instead of logging in to Facebook Insights,
        then switching to LinkedIn Analytics, then checking Instagram — LYRA consolidates
        everything and presents it in a consistent format.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        Analytics data is synced hourly from each connected platform. The dashboard
        reflects data as of the last successful sync, shown in the top right of the page.
      </p>

      <Subsection title="Overview metrics">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The overview row shows aggregate totals across all connected platforms for the
          selected date range:
        </p>
        <div className="space-y-3 mt-3">
          <MetricRow metric="Reach">
            The total number of unique accounts that saw any content from this workspace in
            the period. This is a deduplicated count per platform — the same person seeing
            content on both Facebook and Instagram counts as two reach instances.
          </MetricRow>
          <MetricRow metric="Impressions">
            Total number of times any piece of content was displayed, including repeat views
            by the same account. Impressions are always equal to or greater than reach.
          </MetricRow>
          <MetricRow metric="Engagements">
            Sum of all meaningful interactions across all platforms: likes, reactions,
            comments, shares, saves, reposts, retweets, and link clicks. Impressions (passive
            views) are not counted as engagements.
          </MetricRow>
          <MetricRow metric="Engagement Rate">
            Engagements divided by reach, expressed as a percentage. The most platform-neutral
            way to compare performance across different audience sizes. Industry benchmarks
            typically range from 1–3% on Facebook, 3–6% on Instagram, and 1–2% on LinkedIn.
          </MetricRow>
          <MetricRow metric="Net New Followers">
            Followers gained minus followers lost in the selected period, per platform.
            A positive number indicates audience growth.
          </MetricRow>
          <MetricRow metric="Posts Published">
            Count of posts that were published via LYRA in the selected period, across all
            connected platforms.
          </MetricRow>
        </div>
      </Subsection>

      <Subsection title="Platform breakdown">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Below the overview metrics, each connected platform has its own card showing the
          same set of metrics for that platform only. This lets you immediately see which
          platforms are driving the most engagement and identify any underperforming channels
          that may need a strategy change.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Click any platform card to drill into a full platform-level view with trend charts
          showing daily or weekly metric movement over the selected period.
        </p>
      </Subsection>

      <Subsection title="Engagement chart">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The engagement chart in the middle of the dashboard shows daily engagement over the
          selected period, with each platform rendered as a distinct coloured line. Hover over
          any data point to see the exact figure for that day.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Click any platform name in the chart legend to toggle its line on or off. This is
          useful when one platform&apos;s numbers dwarf the others and you want to zoom in on
          smaller-scale trends.
        </p>
      </Subsection>

      <Subsection title="Top posts">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The Top Posts table at the bottom of the analytics page lists the highest-performing
          posts from the period, ranked by total engagements by default. Each row shows:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>Platform icon and post type (feed, reel, story, etc.)</li>
          <li>Caption snippet and thumbnail if available</li>
          <li>Publish date and time</li>
          <li>Reach, impressions, engagements, and engagement rate for that post</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Click any post row to open a full post analytics panel with a complete breakdown of
          all available metrics for that post, including reactions by type (Facebook), saves
          (Instagram), and profile visits generated.
        </p>
      </Subsection>

      <Subsection title="Changing the date range">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Use the date range picker at the top right of the analytics page. Options:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>Last 7 days</li>
          <li>Last 28 days (default)</li>
          <li>Last 3 months</li>
          <li>Last 6 months</li>
          <li>Last 12 months</li>
          <li>Custom range</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          When you change the range, all cards, charts, and tables update simultaneously.
          The comparison badge on each metric card shows the percentage change versus the
          equivalent prior period (e.g. changing the last 28 days compares it to the 28 days
          before that).
        </p>
      </Subsection>

      <Subsection title="Data availability">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA can only show analytics for posts published while the social account was connected.
          If an account was connected last month, you will see data from last month onwards.
          Historical data prior to the connection date is not available.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Platform APIs have varying data retention windows. Facebook and Instagram provide
          up to 2 years of post-level metrics. LinkedIn provides 12 months. X (Twitter)
          provides 30 days via the standard API.
        </p>
      </Subsection>
    </section>
  )
}
