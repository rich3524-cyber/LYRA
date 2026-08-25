import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

function VoiceField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <p className="font-sans text-sm font-medium text-text-primary shrink-0 w-44">{label}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

export function BrandIntelligenceSection() {
  return (
    <section id="brand-intelligence" className="space-y-8 scroll-mt-28">
      <SectionHeader n="04" title="Brand Intelligence" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        Brand Intelligence (labelled <Strong>Brand AI</Strong> in the sidebar) is the foundation
        of every AI feature in LYRA. Before LYRA can write a caption, respond to a comment, or
        generate a week&apos;s schedule in a client&apos;s voice, it needs a brand profile — a
        structured summary of that client&apos;s tone, themes, and audience. LYRA builds this
        profile from a small, fixed set of inputs: a few pages of the client&apos;s website, any
        guidelines text you paste in, and posts already created inside LYRA for that workspace.
      </p>

      <Subsection title="How it works">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          When you click <Strong>Build brand profile</Strong>, LYRA runs the following pipeline:
        </p>
        <ol className="space-y-3 font-sans text-sm text-text-secondary">
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">1.</span>
            <span>
              <Strong>Website crawl</Strong> — LYRA fetches exactly three pages of the client&apos;s
              site: the homepage, <span className="font-mono text-xs">/about</span>, and{' '}
              <span className="font-mono text-xs">/services</span>. Any of the three that doesn&apos;t
              exist is skipped silently. This is not a full-site crawl — blog posts and other
              linked pages are not fetched, so make sure the brand&apos;s core messaging lives on
              one of these three URLs.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">2.</span>
            <span>
              <Strong>LYRA post history</Strong> — LYRA reads up to 40 recent posts that have
              already been published, scheduled, or approved <em>inside LYRA</em> for this
              workspace. This is not a read of the connected social platforms&apos; own feeds —
              connecting Facebook or Instagram does not by itself give LYRA anything to analyse
              here. A workspace with accounts connected but no posts created through LYRA yet
              contributes zero social signal to the profile.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">3.</span>
            <span>
              <Strong>Pasted guidelines</Strong> — if you&apos;ve typed or pasted brand guidelines
              into the text box on this page, that text is sent along with the crawl and post
              data. There is no document upload — guidelines are plain pasted text only.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">4.</span>
            <span>
              <Strong>Profile synthesis</Strong> — all of the above is sent to the Claude AI
              model, which synthesises a structured brand profile. The profile is stored against
              the workspace and injected into AI caption generation, AI comment responses, and
              AI-generated weekly schedules.
            </span>
          </li>
        </ol>
      </Subsection>

      <Subsection title="Building the brand profile">
        <Steps>
          <Step n={1}>
            Open the workspace and click <Strong>Brand AI</Strong> in the sidebar.
          </Step>
          <Step n={2}>
            The profile panels on this page stay behind a setup checklist until the workspace has
            both a website URL and at least one connected social account. Social accounts are
            connected from <Strong>Settings</Strong>. The website URL, like the workspace name, is
            set once when the workspace is created — there is no way to change it from Settings
            afterward, so get it right at setup time.
          </Step>
          <Step n={3}>
            Optionally, paste brand guidelines into the text box shown on this page — tone of
            voice, messaging rules, target audience, topics to avoid, example copy, and so on.
            This significantly improves profile accuracy. There is no file upload here; paste
            text directly.
          </Step>
          <Step n={4}>
            Click <Strong>Build brand profile</Strong> (or <Strong>Re-analyze</Strong> if a
            profile already exists). A spinner shows while the build runs — there is no
            multi-stage progress bar.
          </Step>
          <Step n={5}>
            Once complete, the Voice Summary and related panels appear below. Review them
            carefully — this is exactly what the AI will use when writing for this client.
          </Step>
        </Steps>
      </Subsection>

      <Subsection title="Understanding the profile">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Once a profile exists, the page shows the following panels. Understanding what each one
          means helps you evaluate whether the profile is accurate before you start using AI
          features.
        </p>
        <div className="space-y-4 mt-3">
          <VoiceField label="Voice Summary">
            A 2–3 sentence description of the brand&apos;s voice and tone, generated by Claude
            from the crawl, post history, and any pasted guidelines.
          </VoiceField>
          <VoiceField label="Tone Attributes">
            5–8 adjectives describing how the brand presents itself — e.g. &ldquo;warm,
            approachable, expert, no-nonsense.&rdquo; These drive tone in every piece of AI
            output.
          </VoiceField>
          <VoiceField label="Content Themes">
            5–8 recurring topics the brand talks about. The AI weaves these into captions and
            responses where relevant.
          </VoiceField>
          <VoiceField label="Audience">
            Demographics, interests, and pain points describing who the brand is talking to. This
            shapes vocabulary choices and content angles.
          </VoiceField>
          <VoiceField label="Posting Guidelines">
            A short set of content-creation rules Claude derives from the inputs above — distinct
            from the raw guidelines text you pasted, which is shown separately underneath so you
            can edit and rebuild.
          </VoiceField>
        </div>
      </Subsection>

      <Subsection title="Tips for the best results">
        <ul className="space-y-2 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            Paste brand guidelines if the client has them. Even a one-page summary significantly
            improves profile accuracy — there&apos;s no need for a formal document.
          </li>
          <li>
            Make sure the client&apos;s core messaging appears on the homepage, /about, or
            /services — those are the only three pages LYRA reads. Content that lives only on a
            blog post or another page won&apos;t be picked up.
          </li>
          <li>
            A connected social account (alongside a website URL) is what unlocks the profile
            panels on this page — but connecting one doesn&apos;t by itself feed the profile any
            voice data. LYRA only analyses posts that have actually been created through LYRA for
            that workspace.
          </li>
          <li>
            If the profile reads incorrectly, try pasting more detailed guidelines and rebuilding.
            Explicit written guidelines always take precedence over inferred behaviour.
          </li>
          <li>
            Rebuild the profile whenever the client rebrands, launches a new campaign, or
            significantly changes their messaging. Rebuilds are rate-limited to 5 per 5 minutes.
          </li>
        </ul>
      </Subsection>

      <Subsection title="Refreshing the profile">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Re-analyze</Strong> at any time to re-run the full build — website crawl,
          LYRA post history, and your currently pasted guidelines text — and replace the existing
          profile with the result.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          LYRA also runs an automatic weekly refresh, but it is not equivalent to a manual
          rebuild and currently has real limitations you should know about:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>It only runs for workspaces that have a website URL set.</li>
          <li>
            It scrapes the homepage only — it does not re-fetch /about or /services the way a
            manual build does.
          </li>
          <li>It uses no social signal at all, regardless of how many posts exist in LYRA.</li>
          <li>
            It does not carry forward your previously pasted guidelines text, so it silently
            clears it from the profile.
          </li>
        </ul>
        <Note>
          Because of the last point, don&apos;t rely on the weekly refresh to preserve pasted
          guidelines. If you depend on written guidelines, re-paste them and use the manual{' '}
          <Strong>Re-analyze</Strong> button rather than waiting for the weekly refresh — it will
          overwrite guidelines-derived accuracy with a website-only, guidelines-free rebuild.
        </Note>
      </Subsection>

      <Subsection title="Crisis Aware keyword suggestions">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          If <Strong>Crisis Aware</Strong> is turned on for the workspace (Settings →
          Add-ons), every brand profile build also generates suggested escalation keywords —
          tailored to this specific business, not a generic list. A &ldquo;Crisis
          keywords&rdquo; panel appears lower on this page whenever Crisis Aware is on, whether
          or not any suggestions currently exist.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Each build typically produces 5–10 suggestions: coverage for legal threats, safety or
          health incidents, and discrimination/harassment or media/press mentions, plus 2–4 terms
          specific to the business&apos;s own industry — e.g. &ldquo;food poisoning&rdquo; for a
          restaurant, &ldquo;data breach&rdquo; for a software company.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Each suggestion is a chip with <Strong>Approve</Strong> and <Strong>Dismiss</Strong> buttons.
          Approving one makes it a live escalation keyword immediately — a comment
          containing it will trigger Crisis Aware. Dismissing one removes it from view and
          stops it being suggested again on a future rebuild. You can also type your own
          keyword directly into the <Strong>Add a keyword</Strong> field, and remove any
          active keyword at any time.
        </p>
        <Note>
          Nothing an AI suggests here ever affects Crisis Aware detection until you
          explicitly approve it — suggestions are just a starting point, not a live
          configuration change.
        </Note>
      </Subsection>

      <Subsection title="What happens without a brand profile">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The three AI features that depend on a brand profile behave differently when one
          doesn&apos;t exist for the workspace — none of them silently fall back to a
          generic voice:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            <Strong>AI caption generation</Strong> is blocked outright with an error asking you to
            build brand intelligence first.
          </li>
          <li>
            <Strong>AI comment responses</Strong> are not disabled — instead, every comment is
            automatically escalated to a human rather than drafted or auto-replied to.
          </li>
          <li>
            <Strong>AI-generated weekly schedules</Strong> are blocked with an error requiring a
            brand profile first.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Manual scheduling, the calendar, analytics, SEO, and manual inbox management all work
          regardless of whether a brand profile has been built.
        </p>
      </Subsection>
    </section>
  )
}
