import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

export function TrendsSection() {
  return (
    <section id="trends" className="space-y-8 scroll-mt-28">
      <SectionHeader n="13" title="LYRA Trend" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA Trend is a paid add-on that discovers what is currently trending across social
        platforms and news sources, scores each trend for relevance to your workspace&apos;s
        specific brand, and surfaces the results in the <Strong>Trend Hub</Strong>. From
        there you can use a trend directly in the post composer — the AI caption generator
        picks it up automatically and angles the post around it.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        Trends are refreshed daily via an automated sync. You can also trigger a manual
        refresh at any time from the Trend Hub. LYRA Trend is available on all plans as
        an à la carte add-on and is activated per workspace.
      </p>

      <Subsection title="Activating LYRA Trend">
        <Steps>
          <Step n={1}>
            Navigate to <Strong>Settings</Strong> for the workspace you want to activate
            Trend on. Scroll to the <Strong>Add-ons</Strong> section.
          </Step>
          <Step n={2}>
            Click <Strong>Activate</Strong> on the LYRA Trend card. You will be taken to
            a Stripe checkout to set up the monthly subscription.
          </Step>
          <Step n={3}>
            Complete checkout. On return, the Trend Hub becomes available in the
            sidebar and the first sync runs within a few minutes.
          </Step>
        </Steps>
        <Note>
          LYRA Trend is billed separately from your main LYRA subscription. It can be
          cancelled at any time from the <Strong>Manage</Strong> button on the add-on card,
          which opens the Stripe billing portal.
        </Note>
      </Subsection>

      <Subsection title="The Trend Hub">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The Trend Hub is accessible from the <Strong>Trends</Strong> link in the sidebar
          (visible only when the add-on is active). It is a split-panel view:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Left panel — trend list</Strong> — shows up to 20 trends, ordered by
            relevance score. Each row shows the trend title, source platform badge, and
            relevance score. Filter chips at the top let you narrow by source:
            All, TikTok, News, Web.
          </li>
          <li>
            <Strong>Right panel — trend detail</Strong> — click any trend to see the full
            description, why it fits this brand (<Strong>Why it fits</Strong>), and the
            two action buttons: <Strong>Use this trend</Strong> and <Strong>Dismiss</Strong>.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The relevance score (0–100) reflects how well-matched the trend is to this
          workspace&apos;s brand profile. Scores above 75 are strong fits. Scores below 50
          are included for visibility but may not be worth pursuing.
        </p>
      </Subsection>

      <Subsection title="Using a trend in the composer">
        <Steps>
          <Step n={1}>
            In the Trend Hub, select a trend from the list and click
            <Strong> Use this trend</Strong>. LYRA marks the trend as Used and opens
            the composer.
          </Step>
          <Step n={2}>
            The composer opens with an <Strong>active trend chip</Strong> displayed above
            the text editor — showing the trend title and source platform. This indicates
            the AI is aware of the trend context.
          </Step>
          <Step n={3}>
            Click <Strong>AI Generate</Strong>. The AI caption generator incorporates the
            trend naturally into the generated copy, while staying true to the brand voice
            profile. The trend is not forced — if it does not fit the post direction,
            remove the chip and generate without it.
          </Step>
          <Step n={4}>
            To remove the active trend at any time, click the <Strong>×</Strong> on the
            trend chip. The next AI generation will be without trend context.
          </Step>
        </Steps>
        <Note>
          You can also access trends directly from the composer without visiting the Trend
          Hub first. Click the <Strong>Trends</Strong> button in the composer toolbar to
          open a slide-in trend picker — browse, expand for detail, and click
          <Strong> Add to post</Strong> to set the active trend.
        </Note>
      </Subsection>

      <Subsection title="Dismissing trends">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          If a trend is not relevant to a client&apos;s current strategy, click
          <Strong> Dismiss</Strong> in the detail panel (or in the slide-in composer picker).
          Dismissed trends are removed from the Hub and do not reappear in future syncs
          unless the sync discovers them again as genuinely new.
        </p>
      </Subsection>

      <Subsection title="Manual refresh">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The Trend Hub shows a <Strong>Refresh</Strong> button at the top right. Clicking
          it triggers a new sync immediately — useful if you want the latest data before a
          content session. Refresh is rate-limited to once every 10 minutes to avoid
          unnecessary API usage.
        </p>
      </Subsection>

      <Subsection title="How trends are discovered">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Each daily sync runs in two stages:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Discovery</Strong> — LYRA queries Perplexity&apos;s real-time search model
            to identify what is currently trending across TikTok, Instagram, X, Reddit, news
            sources, and the broader web. Up to 20 candidate trends are surfaced per sync.
          </li>
          <li>
            <Strong>Scoring</Strong> — each candidate is evaluated by LYRA&apos;s AI against the
            workspace&apos;s brand intelligence profile. The AI assigns a relevance score and writes
            the <Strong>Why it fits</Strong> explanation based on brand voice, audience, and
            content themes. Only scored results appear in the Hub.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Syncs run automatically once per day. The timestamp of the last sync is shown
          at the top of the Trend Hub.
        </p>
      </Subsection>
    </section>
  )
}
