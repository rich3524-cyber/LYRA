import { SectionHeader, Subsection, Strong, Steps, Step, Note, MetricRow } from './primitives'

export function SeoSection() {
  return (
    <section id="seo" className="space-y-8 scroll-mt-28">
      <SectionHeader n="08" title="SEO" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The SEO module brings Google Search Console data directly into LYRA, so you can track
        your client&apos;s organic search performance alongside their social media performance —
        without switching to another tool. You see the queries driving traffic, the pages
        ranking, click-through rates, and position trends, all filtered to the reporting period
        you choose.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA requests <Strong>read-only access</Strong> to Search Console. It cannot modify
        settings, remove URLs from indexing, or make any changes to the connected GSC property.
      </p>

      <Subsection title="Prerequisites">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Before connecting, ensure the following:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            The client&apos;s website is verified in <Strong>Google Search Console</Strong> at
            <a href="https://search.google.com/search-console" className="font-mono text-xs text-accent-silver ml-1 hover:text-text-primary transition-colors">search.google.com/search-console</a>.
          </li>
          <li>
            The Google account you will use to connect has <Strong>Full</Strong> or
            <Strong> Owner</Strong> access to the Search Console property (not Restricted).
          </li>
          <li>
            There is at least 28 days of data in the property. Properties with fewer than
            28 days of data will still connect but some charts will show incomplete data.
          </li>
        </ul>
      </Subsection>

      <Subsection title="Connecting Google Search Console">
        <Steps>
          <Step n={1}>
            Open the workspace and click <Strong>SEO</Strong> in the sidebar. If no GSC
            connection exists, you see the connection screen.
          </Step>
          <Step n={2}>
            Click <Strong>Connect Google Search Console</Strong>.
          </Step>
          <Step n={3}>
            A Google sign-in popup opens. Select the Google account that has access to the
            client&apos;s Search Console property. If the client owns their own GSC, you may need
            to ask them to log in — use the client onboarding link feature for this.
          </Step>
          <Step n={4}>
            Google will ask you to grant LYRA permission to view Search Console performance
            data. Click <Strong>Allow</Strong>.
          </Step>
          <Step n={5}>
            LYRA fetches the list of properties available on that Google account. A property
            picker appears — select the correct website property. If the site is verified as
            both a domain property (e.g.
            <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">example.com</code>) and
            a URL-prefix property (e.g.
            <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">https://www.example.com</code>),
            select the domain property for the most complete data.
          </Step>
          <Step n={6}>
            Click <Strong>Connect this property</Strong>. LYRA saves the connection and loads
            the SEO dashboard with the last 28 days of data.
          </Step>
        </Steps>
        <Note>
          GSC data has a 2–3 day lag built into the Google API. Data for today and the past
          48 hours may not yet appear in the charts. This is a Google limitation and cannot
          be changed.
        </Note>
      </Subsection>

      <Subsection title="Reading the SEO dashboard">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The SEO dashboard is structured into four metric cards at the top and two tables below.
        </p>
        <div className="space-y-3 mt-3">
          <MetricRow metric="Clicks">
            The total number of times a user clicked a result from this site in Google Search.
            A direct measure of organic traffic driven by search.
          </MetricRow>
          <MetricRow metric="Impressions">
            How many times any URL from the site appeared in search results, whether or not
            the user scrolled to see it. Impressions at low positions (e.g. page 3) may not
            have been genuinely visible but are still counted.
          </MetricRow>
          <MetricRow metric="Average CTR">
            Click-through rate: clicks divided by impressions, expressed as a percentage.
            Industry average CTR varies significantly by position — position 1 typically
            achieves 20–35%, position 10 typically 2–5%.
          </MetricRow>
          <MetricRow metric="Average Position">
            The mean ranking position across all queries that generated at least one impression.
            Lower is better — position 1 is the top result. This figure can be misleading in
            isolation because a single query ranking at position 1 with 10,000 impressions
            can skew the average significantly. Use the Top Queries table for richer detail.
          </MetricRow>
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          The <Strong>Top Queries</Strong> table lists the search terms bringing the most traffic,
          with clicks, impressions, CTR, and average position for each. Click any column header
          to sort by that metric. Sorting by <Strong>Impressions</Strong> descending is useful
          for finding high-visibility queries with low CTR — these are opportunities to improve
          title tags and meta descriptions.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The <Strong>Top Pages</Strong> table shows the same metrics broken down by URL rather
          than query. This helps identify which pages are performing strongest organically and
          which may need content improvements.
        </p>
      </Subsection>

      <Subsection title="Changing the date range">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Use the date range picker at the top right of the SEO dashboard to change the
          reporting period. Available options:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>Last 7 days</li>
          <li>Last 28 days (default)</li>
          <li>Last 3 months</li>
          <li>Last 6 months</li>
          <li>Last 12 months</li>
          <li>Last 16 months (maximum supported by the GSC API)</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          All four metric cards and both tables update to reflect the selected range.
        </p>
      </Subsection>

      <Subsection title="Disconnecting Search Console">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Go to <Strong>Settings → Integrations</Strong> and click <Strong>Disconnect</Strong>
          next to Google Search Console. This removes the OAuth token from LYRA. The SEO
          dashboard will show the connection prompt again. No historical query data is stored
          by LYRA — all data is fetched live from the GSC API on each page load, so there is
          nothing to delete.
        </p>
      </Subsection>
    </section>
  )
}
