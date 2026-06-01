import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

export function AssistantSection() {
  return (
    <section id="assistant" className="space-y-8 scroll-mt-28">
      <SectionHeader n="12" title="LYRA Assistant" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The LYRA Assistant analyses the last 90 days of activity for a workspace — posts
        published, engagement patterns, platform performance, and competitor benchmarks — and
        produces two outputs in a single report: a <Strong>Quarterly Review</Strong> summarising
        what has worked and what has not, and a <Strong>3-Month Strategy</Strong> laying out
        a month-by-month content plan with specific pillars, key dates, and posting frequency
        recommendations.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        Reports are generated on demand and stored — you can return to any previous report at
        any time. The Assistant is available on Pro and Agency plans. Starter plan users see an
        upgrade prompt.
      </p>

      <Subsection title="Generating a report">
        <Steps>
          <Step n={1}>
            Navigate to <Strong>LYRA Assistant</Strong> in the sidebar (the Sparkles icon).
          </Step>
          <Step n={2}>
            Select the quarter you want to analyse from the dropdown at the top left of
            the page. The default is the most recently completed quarter.
          </Step>
          <Step n={3}>
            Click <Strong>Generate Report</Strong>. The Assistant analyses all available
            data for the workspace — published posts, engagement metrics, competitor snapshots
            if competitor tracking is enabled, and the brand intelligence profile. Generation
            typically takes 20–40 seconds.
          </Step>
          <Step n={4}>
            The report appears in the main panel. It is automatically saved. Future visits
            to the Assistant page will show this report without needing to regenerate.
          </Step>
          <Step n={5}>
            To produce a fresh report after more data has accumulated — for example at the
            end of a new quarter — click <Strong>Regenerate</Strong>. The previous report
            is replaced.
          </Step>
        </Steps>
        <Note>
          The Assistant requires at least a few published posts to produce meaningful output.
          Workspaces with no published posts will see a prompt to schedule and publish content first.
          A built Brand Intelligence Profile significantly improves the quality of strategy recommendations.
        </Note>
      </Subsection>

      <Subsection title="Reading the Quarterly Review">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The Quarterly Review section of the report covers what happened over the past 90 days.
          It is divided into three parts:
        </p>
        <ul className="space-y-3 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Performance Summary</Strong> — a plain-language paragraph interpreting the
            quarter&apos;s results: total reach, engagement trends, standout posts, and any platforms
            that over- or under-performed relative to expectations.
          </li>
          <li>
            <Strong>Platform Breakdown</Strong> — individual cards for each connected platform
            showing post count, average engagement rate, best-performing post, and the AI&apos;s
            assessment of that platform&apos;s performance this quarter.
          </li>
          <li>
            <Strong>Competitor Context</Strong> — shown when competitor tracking is enabled.
            Compares the workspace&apos;s posting frequency and engagement benchmarks against
            each tracked competitor, highlighting gaps and advantages.
          </li>
        </ul>
      </Subsection>

      <Subsection title="Reading the 3-Month Strategy">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The 3-Month Strategy maps out a content plan for the three months ahead.
          Each month is presented as its own card with:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            <Strong>Content pillars</Strong> — 3–5 specific themes the AI recommends focusing on,
            drawn from the brand profile, historical engagement patterns, and seasonal context
          </li>
          <li>
            <Strong>Key dates</Strong> — upcoming events, holidays, or industry moments relevant
            to the brand&apos;s audience that are worth planning content around
          </li>
          <li>
            <Strong>Posting cadence</Strong> — recommended number of posts per week per platform,
            based on what has historically driven the best engagement for this workspace
          </li>
          <li>
            <Strong>Strategic rationale</Strong> — a short explanation of why these recommendations
            were made for that particular month
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-1">
          The strategy is a starting point, not a rigid plan. Use it to brief the AI Schedule
          Generator or to guide manual content creation — take what is useful and discard what
          does not fit the client&apos;s current priorities.
        </p>
      </Subsection>

      <Subsection title="Exporting as PDF">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The full report can be exported as a branded PDF — useful for client quarterly reviews,
          internal planning decks, or records.
        </p>
        <Steps>
          <Step n={1}>
            With a report loaded, click <Strong>Export PDF</Strong> in the controls panel
            on the left side of the Assistant page.
          </Step>
          <Step n={2}>
            LYRA generates the PDF in the background. This takes a few seconds.
            A download link appears when it is ready.
          </Step>
          <Step n={3}>
            Click the link to download the PDF. It includes the workspace name, the reporting
            quarter, and the full report content formatted for print.
          </Step>
        </Steps>
        <Note>
          PDF export is available on Pro and Agency plans. The export button is disabled
          while a report is being generated.
        </Note>
      </Subsection>

      <Subsection title="When to use the Assistant">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          For most agency workflows, run the Assistant at the end of each calendar quarter
          before the client check-in. The Quarterly Review gives you the data to justify
          what was done, and the 3-Month Strategy gives you a defensible plan for the next
          period — without hours of manual analysis.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          For SMB or freelancer workspaces with smaller data sets, monthly runs can work well —
          particularly when competitor tracking is enabled and there is enough post history
          to make the comparisons meaningful.
        </p>
      </Subsection>
    </section>
  )
}
