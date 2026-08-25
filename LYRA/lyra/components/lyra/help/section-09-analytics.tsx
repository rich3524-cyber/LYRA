import { SectionHeader, Subsection, MetricRow } from './primitives'

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
        Metrics update automatically in the background on a periodic cycle. You can also
        trigger an on-demand refresh at any time using the <em>Sync</em> button next to the
        date-range buttons at the top of the dashboard.
      </p>

      <Subsection title="Overview metrics">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The top row shows five aggregate totals across all connected platforms for the
          selected date range:
        </p>
        <div className="space-y-3 mt-3">
          <MetricRow metric="Posts Published">
            Count of posts that were published via LYRA in the selected period, across all
            connected platforms.
          </MetricRow>
          <MetricRow metric="Total Reach">
            Sum, across every post published in the period, of the reach figure each platform
            reports for that post.
          </MetricRow>
          <MetricRow metric="Total Views">
            Sum of the views figure each platform reports for each post in the period. Shown
            alongside reach (not instead of it) because platforms often report reach more
            slowly than views — a post can show real view activity while its reach is still 0
            in the hours after publishing.
          </MetricRow>
          <MetricRow metric="Total Likes">
            Sum of likes across every post published in the period.
          </MetricRow>
          <MetricRow metric="Response Rate">
            The percentage of the workspace&apos;s comments from the period that have been
            responded to. The card also shows the number still pending a reply.
          </MetricRow>
        </div>
      </Subsection>

      <Subsection title="Posts by platform">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Below the overview metrics, a Posts by platform panel lists each connected platform
          with the number of posts published to it during the selected period, alongside a bar
          scaled relative to whichever platform published the most. This reflects post volume
          only, not reach, views, or engagement per platform — and the list is not interactive;
          there is no drill-down view behind it.
        </p>
      </Subsection>

      <Subsection title="Engagement chart">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The Engagement over time chart shows daily totals for the selected period, combined
          across every connected platform. It plots five lines — Reach, Views, Likes, Comments,
          and Shares — each a distinct colour identified in the legend below the chart. Hover
          over any point to see the exact figures for that day.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The legend labels each line by colour but is not interactive — clicking a legend
          entry does not hide or isolate that line.
        </p>
      </Subsection>

      <Subsection title="Top posts">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The Top posts by reach panel lists up to five posts from the period, ranked by reach
          (ties are broken by views). Each entry shows:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>Platform badge</li>
          <li>Reach, views, likes, and comment counts</li>
          <li>A two-line snippet of the post&apos;s content</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Entries are not clickable — there is no expanded per-post analytics view, publish
          timestamp, thumbnail, or engagement-rate figure shown here.
        </p>
      </Subsection>

      <Subsection title="Changing the date range">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Use the three buttons at the top of the dashboard to switch periods:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>7d — last 7 days</li>
          <li>30d — last 30 days (default)</li>
          <li>90d — last 90 days</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          There is no custom date-range option. When you switch periods, the overview metrics,
          engagement chart, platform list, and top posts all update together; switching back to
          a period you&apos;ve already viewed loads instantly from cache instead of re-fetching.
        </p>
      </Subsection>

      <Subsection title="Data availability">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA can only show analytics for posts that were scheduled or published through LYRA
          itself — it has no way to pull in historical performance data for content that
          existed on a platform before the account was connected.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Metric syncing (both the automatic background refresh and the manual Sync button)
          only looks at posts published within the last 30 days. A post older than that stops
          receiving new metric updates — the 90-day view will still show it, but with whatever
          numbers were last synced before it aged out of that window.
        </p>
      </Subsection>
    </section>
  )
}
