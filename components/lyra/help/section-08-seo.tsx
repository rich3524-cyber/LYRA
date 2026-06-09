import { SectionHeader, Subsection, Strong, Steps, Step, Note, MetricRow } from './primitives'

export function SeoSection() {
  return (
    <section id="seo" className="space-y-8 scroll-mt-28">
      <SectionHeader n="08" title="SEO" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The SEO module brings Google Search Console data directly into LYRA, so you can track
        organic search performance alongside social media performance — without switching tools.
        Once connected, you can also add individual pages, score them on on-page SEO factors,
        and generate AI-optimised meta titles, descriptions, H1 headings, and intro copy.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA requests <Strong>read-only access</Strong> to Search Console. It cannot modify
        settings, remove URLs from indexing, or make any changes to the connected GSC property.
      </p>

      <Subsection title="Prerequisites">
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            The client&apos;s website is verified in <Strong>Google Search Console</Strong> at{' '}
            <a href="https://search.google.com/search-console" className="font-mono text-xs text-accent-silver hover:text-text-primary transition-colors">search.google.com/search-console</a>.
          </li>
          <li>
            The Google account you connect has <Strong>Full</Strong> or <Strong>Owner</Strong>{' '}
            access to the Search Console property — not Restricted access.
          </li>
          <li>
            At least 28 days of data exists in the property. Newer properties still connect but
            some charts will show incomplete data.
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
            Click <Strong>Connect Search Console</Strong>.
          </Step>
          <Step n={3}>
            A Google sign-in page opens. Select the Google account that has access to the
            client&apos;s Search Console property.
          </Step>
          <Step n={4}>
            Google asks you to grant LYRA permission to view Search Console performance data.
            Click <Strong>Allow</Strong>.
          </Step>
          <Step n={5}>
            LYRA automatically selects the property whose URL matches the workspace website URL.
            If no match is found, the first available property is selected. The SEO dashboard
            loads immediately with the last 28 days of data.
          </Step>
        </Steps>
        <Note>
          GSC data has a 2–3 day lag built into the Google API. Data for the past 48 hours may
          not yet appear in the charts. This is a Google limitation and cannot be changed.
        </Note>
      </Subsection>

      <Subsection title="Reading the SEO dashboard">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The SEO dashboard shows four metric cards at the top and two tables below.
        </p>
        <div className="space-y-3 mt-3">
          <MetricRow metric="Clicks">
            The total number of times a user clicked a result from this site in Google Search.
            A direct measure of organic traffic driven by search.
          </MetricRow>
          <MetricRow metric="Impressions">
            How many times any URL from the site appeared in search results. Impressions at low
            positions may not have been visibly seen but are still counted.
          </MetricRow>
          <MetricRow metric="Average CTR">
            Click-through rate: clicks divided by impressions, expressed as a percentage.
            Position 1 typically achieves 20–35%; position 10 typically 2–5%.
          </MetricRow>
          <MetricRow metric="Average Position">
            The mean ranking position across all queries that generated at least one impression.
            Lower is better. Use the Top Queries table for richer detail — a single high-volume
            query can skew this average significantly.
          </MetricRow>
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          The <Strong>Top Queries</Strong> table lists the search terms bringing the most traffic,
          with clicks, impressions, CTR, and average position for each. Click any column header
          to sort. Sorting by <Strong>Impressions</Strong> descending surfaces high-visibility
          queries with low CTR — these are opportunities to improve title tags and meta descriptions.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The <Strong>Top Pages</Strong> table shows the same metrics broken down by URL. This
          identifies which pages perform strongest organically and which need content improvements.
        </p>
      </Subsection>

      <Subsection title="Changing the date range">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Use the date range picker at the top right of the SEO dashboard to change the reporting
          period. Available options: Last 7 days, Last 28 days (default), Last 3 months, Last
          6 months, Last 12 months, Last 16 months (maximum supported by the GSC API). All four
          metric cards and both tables update to reflect the selected range.
        </p>
      </Subsection>

      <Subsection title="Tracked pages">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Below the GSC analytics, the <Strong>Tracked Pages</Strong> section lets you add any
          URL from the client&apos;s website for on-page scoring and AI content generation.
          Tracked pages are independent of the GSC data — you can add any page you want to
          optimise, whether or not it appears in the Top Pages table.
        </p>
        <Steps>
          <Step n={1}>
            Paste a full URL into the input field (including{' '}
            <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md">https://</code>)
            and click <Strong>Add</Strong> or press Enter.
          </Step>
          <Step n={2}>
            The page appears in the list. Click the expand chevron or run Analyse or Generate
            to begin working on it.
          </Step>
          <Step n={3}>
            To remove a page, click the trash icon on the right of any page card.
          </Step>
        </Steps>
        <Note>
          Each URL can only be added once per workspace. Attempting to add a duplicate returns
          an error.
        </Note>
      </Subsection>

      <Subsection title="On-page analysis">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Analyse</Strong> on any tracked page to score its current on-page SEO.
          LYRA fetches the live page HTML and evaluates four dimensions:
        </p>
        <div className="space-y-3 mt-3">
          <MetricRow metric="Title">
            Checks for the presence of a title tag, its length (50–60 characters is optimal),
            and whether it avoids being truncated in search results.
          </MetricRow>
          <MetricRow metric="Meta description">
            Checks for the presence of a meta description and its length (150–160 characters is
            optimal). Missing or overly short meta descriptions reduce click-through rates.
          </MetricRow>
          <MetricRow metric="H1">
            Checks that exactly one H1 heading exists on the page. Multiple H1s or a missing
            H1 both reduce the score.
          </MetricRow>
          <MetricRow metric="Heading structure">
            Checks that headings follow a logical hierarchy (H1 → H2 → H3) without skipping
            levels. A well-structured heading hierarchy improves both SEO and accessibility.
          </MetricRow>
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          Each dimension is scored out of 25, giving a total score out of 100. The score appears
          in <span className="font-sans text-sm font-medium text-status-success">green</span>{' '}
          (75+),{' '}
          <span className="font-sans text-sm font-medium text-status-warning">amber</span>{' '}
          (50–74), or{' '}
          <span className="font-sans text-sm font-medium text-status-error">red</span>{' '}
          (below 50). Each dimension also
          shows the current value detected — useful for confirming what the AI generator will
          be working from.
        </p>
      </Subsection>

      <Subsection title="AI-generated SEO content">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Generate</Strong> on any tracked page to produce AI-optimised SEO
          content. LYRA analyses the page and uses the workspace&apos;s brand profile to generate
          four pieces of copy:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2 mt-3">
          <li><Strong>Meta Title</Strong> — a search-optimised page title, 50–60 characters</li>
          <li><Strong>Meta Description</Strong> — a compelling description for search results, 150–160 characters</li>
          <li><Strong>H1 Heading</Strong> — a primary heading optimised for the target keyword</li>
          <li><Strong>Intro Copy</Strong> — an opening paragraph that introduces the page topic naturally</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          The generated content appears in an expanded panel below the score breakdown. Each
          piece has a copy button so you can paste it directly into your CMS. LYRA stores the
          latest generated content for each page — clicking Generate again overwrites the
          previous version.
        </p>
        <Note>
          LYRA generates the content but cannot push it to your website. You must apply the
          generated titles, descriptions, and headings manually in your CMS. The GSC API does
          not support writing changes to websites.
        </Note>
      </Subsection>

      <Subsection title="Disconnecting Search Console">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Go to <Strong>Settings</Strong> and click <Strong>Disconnect</Strong> next to Google
          Search Console. This removes the OAuth token from LYRA. The SEO dashboard reverts to
          the connection prompt. No historical query data is stored by LYRA — all data is fetched
          live from the GSC API on each page load, so there is nothing to delete. Tracked pages
          and any previously generated AI content are retained.
        </p>
      </Subsection>
    </section>
  )
}
