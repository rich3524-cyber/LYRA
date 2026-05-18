import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step } from './primitives'

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
        Brand Intelligence is the foundation of every AI feature in LYRA. Before LYRA can write
        a single caption or respond to a comment in a client&apos;s voice, it needs to understand who
        that client is — their personality, their audience, their values, and how they communicate.
        The Brand Intelligence engine builds this understanding automatically by analysing the
        client&apos;s digital footprint.
      </p>

      <Subsection title="How it works">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          When you click <Strong>Build brand profile</Strong>, LYRA runs the following analysis
          pipeline automatically:
        </p>
        <ol className="space-y-3 font-sans text-sm text-text-secondary">
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">1.</span>
            <span>
              <Strong>Website crawl</Strong> — LYRA fetches and analyses the client&apos;s website,
              reading the homepage, about page, services/products, blog posts, and any other
              linked pages it can access. It extracts tone, messaging frameworks, value propositions,
              and target audience language.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">2.</span>
            <span>
              <Strong>Social feed analysis</Strong> — if social accounts are connected, LYRA
              analyses the recent post history to understand how the brand already communicates
              on social media — vocabulary, hashtag patterns, emoji usage, post length preferences,
              and engagement triggers.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">3.</span>
            <span>
              <Strong>Document parsing</Strong> — if you upload brand guidelines, a brand book,
              or a content strategy document, LYRA parses it to extract explicit rules, approved
              language, off-limits topics, and brand personality definitions.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">4.</span>
            <span>
              <Strong>Profile synthesis</Strong> — all inputs are sent to the Claude AI model,
              which synthesises a structured brand intelligence profile. This profile is stored
              against the workspace and injected as context into every subsequent AI request.
            </span>
          </li>
        </ol>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The entire process typically takes 30–90 seconds depending on website size and the
          number of social posts available to analyse.
        </p>
      </Subsection>

      <Subsection title="Building the brand profile">
        <Steps>
          <Step n={1}>
            Open the workspace and click <Strong>Brand Intelligence</Strong> in the sidebar.
          </Step>
          <Step n={2}>
            Verify the website URL shown at the top is correct. If it needs updating, click
            <Strong> Edit</Strong> or go to <Strong>Settings → General</Strong>.
          </Step>
          <Step n={3}>
            Optionally, click <Strong>Upload guidelines</Strong> to attach a brand guidelines PDF,
            content strategy document, or Word file. This significantly improves profile accuracy.
            Accepted formats: PDF, DOCX, DOC. Maximum file size: 20 MB.
          </Step>
          <Step n={4}>
            Click <Strong>Build brand profile</Strong>. A progress bar shows each stage
            (Crawling website → Analysing social feed → Processing documents → Building profile).
          </Step>
          <Step n={5}>
            Once complete, the <Strong>Voice Summary</Strong> panel appears with the full profile.
            Review it carefully — this is exactly what the AI will use when writing for this client.
          </Step>
        </Steps>
      </Subsection>

      <Subsection title="Understanding the voice summary">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The Voice Summary is structured into five areas. Understanding what each one means
          helps you evaluate whether the profile is accurate before you start using AI features.
        </p>
        <div className="space-y-4 mt-3">
          <VoiceField label="Brand personality">
            Adjectives that describe how the brand presents itself — e.g. &ldquo;warm, approachable,
            expert, no-nonsense.&rdquo; These drive tone in every piece of AI output.
          </VoiceField>
          <VoiceField label="Writing style">
            Structural and stylistic traits — e.g. &ldquo;short sentences, direct address, minimal
            jargon, frequent use of rhetorical questions.&rdquo; The AI mirrors these patterns in
            generated content.
          </VoiceField>
          <VoiceField label="Core themes &amp; key messages">
            The 3–7 recurring ideas the brand communicates — the things they always want to
            reinforce. The AI will weave these into captions and responses naturally.
          </VoiceField>
          <VoiceField label="What to avoid">
            Tone or language patterns that feel off-brand. The AI actively avoids these when
            writing. Common examples: overly formal language, hype words, competitor mentions.
          </VoiceField>
          <VoiceField label="Audience">
            A description of who the brand is talking to — their demographics, interests,
            pain points, and level of sophistication. This shapes vocabulary choices and
            content angles.
          </VoiceField>
        </div>
      </Subsection>

      <Subsection title="Tips for the best results">
        <ul className="space-y-2 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            Upload brand guidelines if the client has them. Even a one-page brand summary
            significantly improves profile accuracy.
          </li>
          <li>
            Make sure the website URL points to the client&apos;s primary domain with substantial
            written content. LYRA cannot crawl sites that require login or that are entirely
            image-based.
          </li>
          <li>
            Connect social accounts before building the profile so LYRA can analyse existing
            post history. Facebook and Instagram provide the richest feed data.
          </li>
          <li>
            If the voice summary reads incorrectly, try uploading a brand guidelines document
            and rebuilding. Explicit written guidelines always take precedence over inferred
            behaviour.
          </li>
          <li>
            Rebuild the profile whenever the client rebrands, launches a new campaign, or
            significantly changes their messaging.
          </li>
        </ul>
      </Subsection>

      <Subsection title="Refreshing the profile">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Refresh profile</Strong> at any time to re-crawl the website and
          regenerate the brand intelligence using the latest content. The previous profile is
          replaced with the updated one. This is useful after a client rebrand, a major campaign
          launch, or after uploading new brand guidelines.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          LYRA also runs an automatic weekly refresh for all workspaces to ensure brand profiles
          stay current. This background refresh uses the same inputs as a manual rebuild.
        </p>
      </Subsection>

      <Subsection title="What happens without a brand profile">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          If Brand Intelligence has not been built for a workspace, AI caption generation and
          AI comment responses are disabled for that workspace. You will see an inline prompt
          directing you to the Brand Intelligence page before you can use those features.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          All other features — scheduling, calendar, analytics, SEO, and manual inbox management
          — work regardless of whether Brand Intelligence has been built.
        </p>
      </Subsection>
    </section>
  )
}
