import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step, PlatformBadge, StatusBadge, StatusRow } from './primitives'

function AutonomyCard({ name, plan, children }: { name: string; plan: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 rounded-xl bg-background-secondary border border-background-border space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm font-medium text-text-primary">{name}</p>
        <span className="font-sans text-xs text-text-tertiary">{plan}</span>
      </div>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

function GuardrailRow({ type, children }: { type: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 rounded-xl bg-background-secondary border border-background-border space-y-2">
      <p className="font-sans text-sm font-medium text-text-primary">{type}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

export function InboxSection() {
  return (
    <section id="inbox" className="space-y-8 scroll-mt-28">
      <SectionHeader n="07" title="Inbox" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The inbox is the nerve centre of LYRA&apos;s core differentiator: AI-powered comment and
        review responses. Comments, replies, and reviews from all connected social platforms
        are pulled into a unified inbox every 5 minutes. LYRA&apos;s AI analyses each one and —
        depending on your autonomy setting — either drafts a response for your review or posts
        one automatically.
      </p>

      <Subsection title="How comments are collected">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA&apos;s comment monitoring worker polls all connected social platforms every 5 minutes.
          New comments are pulled in, de-duplicated, and added to the inbox. The following
          interaction types are supported:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary">
          <li><PlatformBadge>Facebook</PlatformBadge> — comments and replies on Page posts</li>
          <li><PlatformBadge>Instagram</PlatformBadge> — comments on feed posts and reels</li>
          <li><PlatformBadge>LinkedIn</PlatformBadge> — comments on company page posts</li>
          <li><PlatformBadge>Google Business</PlatformBadge> — all reviews (star rating + text)</li>
          <li><PlatformBadge>X (Twitter)</PlatformBadge> — mentions and direct replies</li>
          <li><PlatformBadge>TikTok</PlatformBadge> — comments on video posts</li>
        </ul>
      </Subsection>

      <Subsection title="Comment statuses explained">
        <div className="space-y-3">
          <StatusRow status="Pending" color="text-text-tertiary border-background-border-mid">
            The comment has been received but not yet processed by the AI. This status
            is brief — the AI usually processes new comments within 30 seconds of them
            arriving in the inbox.
          </StatusRow>
          <StatusRow status="AI Drafted" color="text-status-info border-status-info/30">
            The AI has generated a draft response. The response is ready for your review
            if you are on Draft + Approve mode, or will be queued for auto-posting if you
            are on Full Autonomy.
          </StatusRow>
          <StatusRow status="Awaiting Approval" color="text-status-warning border-status-warning/30">
            (Draft + Approve mode only) The AI draft is ready and waiting for a human to
            approve it before it is posted to the platform.
          </StatusRow>
          <StatusRow status="Responded" color="text-status-success border-status-success/30">
            A response has been successfully posted to the platform. The timestamp shows
            when it was posted.
          </StatusRow>
          <StatusRow status="Escalated" color="text-status-error border-status-error/30">
            The comment has been flagged for immediate human attention. The AI will not
            auto-respond to escalated comments regardless of autonomy setting. You receive
            an email notification when a comment is escalated.
          </StatusRow>
          <StatusRow status="Ignored" color="text-text-tertiary border-background-border-mid">
            The comment has been manually dismissed. It will not receive a response.
            This is appropriate for spam, bot activity, or comments that don&apos;t require
            a response (e.g. a simple &ldquo;❤️&rdquo;).
          </StatusRow>
        </div>
      </Subsection>

      <Subsection title="AI autonomy settings">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The autonomy setting is configured per workspace in <Strong>Settings → AI Autonomy</Strong>.
          It controls the degree to which LYRA acts without human review.
        </p>
        <div className="space-y-4 mt-3">
          <AutonomyCard name="Off" plan="All plans">
            LYRA collects comments and displays them in the inbox but does not draft or post any
            AI responses. You handle all responses manually. The inbox is still a useful unified
            view — you can write manual responses from within LYRA and they will be posted to
            the platform on your behalf.
          </AutonomyCard>
          <AutonomyCard name="Draft + Approve" plan="Pro and Agency">
            LYRA generates a draft response for every new comment using the brand&apos;s voice profile
            and any applicable guardrails. The draft appears in the inbox with
            <StatusBadge color="text-status-warning border-status-warning/30">Awaiting Approval</StatusBadge> status.
            You review and optionally edit each response, then click <Strong>Approve &amp; Post</Strong>
            to publish it. No response goes live without a human having seen it. This is the
            recommended setting for most agencies starting with AI responses.
          </AutonomyCard>
          <AutonomyCard name="Full Autonomy" plan="Agency only">
            LYRA generates and posts responses automatically without any human review step.
            Responses are live within approximately 2 minutes of the comment appearing. You can
            review posted responses at any time in the inbox. Guardrails (see below) are
            especially important in Full Autonomy mode — configure them carefully before
            enabling this setting.
          </AutonomyCard>
        </div>
      </Subsection>

      <Subsection title="Reviewing and approving a response">
        <Steps>
          <Step n={1}>
            Open the inbox. Responses awaiting approval are shown at the top of the list with
            an amber border. Click any comment card to open the review panel.
          </Step>
          <Step n={2}>
            The panel shows the original comment (left) and the AI-drafted response (right),
            with the commenter&apos;s name, platform, and timestamp.
          </Step>
          <Step n={3}>
            Read the response. If it looks good, click <Strong>Approve &amp; Post</Strong>.
            The response is posted to the platform immediately.
          </Step>
          <Step n={4}>
            If you want to edit the response first, click directly in the response text field.
            It is fully editable. Make your changes, then click <Strong>Approve &amp; Post</Strong>.
          </Step>
          <Step n={5}>
            If the comment should not receive a response, click <Strong>Ignore</Strong>.
            The comment is marked as Ignored and removed from the approval queue.
          </Step>
          <Step n={6}>
            If the comment requires special attention (a complaint, a crisis, a factual dispute),
            click <Strong>Escalate</Strong> instead. The comment is pinned and you receive a
            notification. The AI will not respond to it automatically.
          </Step>
        </Steps>
      </Subsection>

      <Subsection title="Writing a manual response">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          You are never required to use the AI draft. For any comment in any status, you can
          write a fully manual response. Open the comment card and click <Strong>Write manually</Strong>
          to dismiss the AI draft and open a blank response editor. Type your response and click
          <Strong> Post response</Strong>.
        </p>
      </Subsection>

      <Subsection title="Filtering the inbox">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The inbox can be filtered by:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li><Strong>Status</Strong> — show only Awaiting Approval, Escalated, Responded, etc.</li>
          <li><Strong>Platform</Strong> — show only Facebook comments, only Google reviews, etc.</li>
          <li><Strong>Date range</Strong> — focus on a specific time window</li>
          <li><Strong>Sentiment</Strong> — filter to show only negative or positive comments
            (AI-classified during processing)</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          By default, the inbox shows comments from the last 30 days, sorted by most recent first.
          Escalated comments are always shown at the top regardless of date.
        </p>
      </Subsection>

      <Subsection title="Guardrails (Agency plan)">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Guardrails define hard constraints that the AI must respect when generating responses
          for a workspace. They are especially important for Full Autonomy mode. Configure them
          in <Strong>Settings → Guardrails</Strong>.
        </p>
        <div className="space-y-3 mt-3">
          <GuardrailRow type="Never discuss">
            Topics or subjects the AI must never engage with in responses. Examples: competitor
            names, pricing, pending litigation, specific people, religion, politics. The AI will
            deflect any comment on these topics and escalate if necessary.
          </GuardrailRow>
          <GuardrailRow type="Never use word">
            Specific words, phrases, or expressions the AI must never use. Useful for brands
            that have internal language standards — e.g. a brand that says &ldquo;partners&rdquo; not
            &ldquo;customers&rdquo;, or wants to avoid words like &ldquo;cheap&rdquo; or &ldquo;deal&rdquo;.
          </GuardrailRow>
          <GuardrailRow type="Always escalate">
            Comment patterns or keywords that should always trigger an escalation regardless of
            autonomy setting. Examples: &ldquo;refund&rdquo;, &ldquo;lawyer&rdquo;, &ldquo;disgusting&rdquo;, any mention of
            allergic reactions for a food brand. The AI will not respond and will flag immediately.
          </GuardrailRow>
          <GuardrailRow type="Approved answers">
            Pre-written responses for common recurring questions — opening hours, delivery times,
            pricing, FAQs. When a comment matches an approved answer&apos;s trigger pattern, the AI
            uses the pre-written response verbatim rather than generating a new one. This ensures
            factual accuracy for questions with definitive answers.
          </GuardrailRow>
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          Guardrails are checked before any response is generated. If a guardrail triggers,
          the response is blocked and the comment is escalated automatically.
        </p>
      </Subsection>
    </section>
  )
}
