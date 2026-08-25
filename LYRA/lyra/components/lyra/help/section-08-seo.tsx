import { SectionHeader, Subsection, Strong, Steps, Step, Note, MetricRow } from './primitives'

export function SeoSection() {
  return (
    <section id="seo" className="space-y-8 scroll-mt-28">
      <SectionHeader n="08" title="SEO" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The SEO module connects Google Search Console to a workspace and adds two tools on top
        of it: an <Strong>on-page scorer</Strong> that checks a page&apos;s title, meta
        description, and heading structure, and an <Strong>AI content generator</Strong> that
        drafts a replacement title, description, H1, and intro line for that page. Search
        Console itself supplies a click/impression trend and a table of top search queries.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA requests <Strong>read-only access</Strong> to Search Console. It cannot modify
        settings, remove URLs from indexing, or make any changes to the connected GSC property.
      </p>

      <Subsection title="Prerequisites">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Before connecting, the client&apos;s website needs to be verified in{' '}
          <Strong>Google Search Console</Strong> at
          <a href="https://search.google.com/search-console" className="font-mono text-xs text-accent-silver ml-1 hover:text-text-primary transition-colors">search.google.com/search-console</a>,
          under the Google account you&apos;ll use to connect. That&apos;s the only hard
          requirement — LYRA only asks for read-only Search Console access, so there&apos;s no
          minimum permission level (Full/Owner vs. Restricted) or minimum amount of history the
          property needs to have accumulated.
        </p>
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
            You&apos;re redirected to Google sign-in (not a popup — a full-page navigation).
            Select the Google account that has access to the client&apos;s Search Console
            property. There is currently no step in the client onboarding link for the client to
            connect their own GSC account — someone with access to the Google account (you or
            the client, over a screen-share or shared login) needs to complete this redirect
            directly.
          </Step>
          <Step n={4}>
            Google will ask you to grant LYRA permission to view Search Console performance
            data. Click <Strong>Allow</Strong>.
          </Step>
          <Step n={5}>
            LYRA picks a property automatically — there is no property picker to choose from.
            It looks at the Google account&apos;s verified Search Console properties and
            matches whichever one&apos;s URL contains the workspace&apos;s website URL. If the
            account has no property matching the workspace&apos;s website (or the workspace has
            no website URL set), LYRA silently falls back to the first property returned by
            Google. There is currently no in-app way to fix this if the automatic match picks
            the wrong property — Settings has no field to edit the workspace&apos;s website URL
            after creation.
          </Step>
        </Steps>
        <Note>
          GSC data has a 3-day lag built into the Google API. Data for the last few days may not
          yet appear in the chart or query table. This is a Google limitation and cannot be
          changed.
        </Note>
      </Subsection>

      <Subsection title="Scoring a page">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Under <Strong>Tracked Pages</Strong>, paste a URL and click <Strong>Add</Strong> to
          start tracking it. Tracking a page doesn&apos;t analyse it yet — click{' '}
          <Strong>Analyse</Strong> on a tracked page to fetch its live HTML and score it out of
          100 across four dimensions, 25 points each:
        </p>
        <div className="space-y-3 mt-3">
          <MetricRow metric="Title tag">
            25 points for a title between 50–60 characters. Shorter or longer titles score
            partial credit; a missing title tag scores 0.
          </MetricRow>
          <MetricRow metric="Meta description">
            25 points for a meta description between 120–160 characters, on the same sliding
            scale as the title.
          </MetricRow>
          <MetricRow metric="H1 heading">
            25 points for exactly one H1 on the page. Zero H1 tags scores 0; more than one
            scores partial credit, since duplicate H1s are treated as a structure problem.
          </MetricRow>
          <MetricRow metric="Heading structure">
            25 points if the page has at least one H2. A page with an H1 but no H2s gets partial
            credit; a page with neither gets 0.
          </MetricRow>
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          The resulting score appears next to the page&apos;s URL — green at 75 and above,
          amber from 50–74, red below 50 — and expanding the page shows the breakdown and a note
          explaining each dimension&apos;s score. Because the analyser fetches the live page
          each time, re-running <Strong>Analyse</Strong> after a content change reflects the
          update immediately; nothing is cached.
        </p>
      </Subsection>

      <Subsection title="Generating AI content">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Generate</Strong> on a tracked page to have Claude draft a replacement{' '}
          <Strong>meta title</Strong>, <Strong>meta description</Strong>, <Strong>H1</Strong>,
          and a short <Strong>intro line</Strong>, based on the page&apos;s current title tag,
          meta description, and H1 (fetched fresh, the same way <Strong>Analyse</Strong> does —
          not the full page body or markup) and the workspace&apos;s Brand AI profile, when one
          is set — voice, tone attributes, and content themes all feed into the prompt. Without
          a brand profile, LYRA falls back to a generic professional tone.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Generating content also re-scores the page in the background, but the score shown next
          to the page&apos;s URL won&apos;t reflect that until you click <Strong>Analyse</Strong>{' '}
          again or reload the page. Each generated field is shown with its character count and a
          copy-to-clipboard button — nothing is written back to the live page automatically; you
          copy the text out and publish it yourself through whatever CMS the site runs on.
          Generation is rate-limited per user, so running it repeatedly in a short window will
          eventually be throttled.
        </p>
      </Subsection>

      <Subsection title="Search performance">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Below the tracked pages, LYRA shows two read-only Search Console views. There is no
          date range picker — both windows are fixed:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2 mt-1">
          <li>
            A <Strong>clicks and impressions</Strong> line chart covering the last 30 days.
          </li>
          <li>
            A <Strong>Top Queries</Strong> table covering the last 90 days, showing the 25
            queries with the most clicks — clicks, impressions, CTR, and average position for
            each. The table is sorted by clicks descending and isn&apos;t sortable by column or
            paginated past 25 rows; there is no separate breakdown by page.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          If the connection has expired, this section shows a reconnect prompt instead of data —
          click through it to repeat the Google sign-in redirect.
        </p>
      </Subsection>

      <Subsection title="Removing a tracked page">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Each tracked page has its own trash-can button, next to Analyse and Generate. Deleting
          a page removes it — and any AI-generated content saved against it — immediately; this
          doesn&apos;t require disconnecting Search Console or touching the workspace at all.
        </p>
      </Subsection>

      <Subsection title="Disconnecting Search Console">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          There is currently no standalone way to disconnect Google Search Console from a
          workspace. The stored connection (and encrypted OAuth tokens) is only removed when the
          workspace or the account is deleted entirely — deleting individual tracked pages, as
          above, doesn&apos;t touch the connection itself.
        </p>
      </Subsection>
    </section>
  )
}
