import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step, PlatformBadge, StatusBadge, StatusRow, Note } from './primitives'

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
        The inbox is the nerve centre of LYRA&apos;s core differentiator: AI-powered comment
        responses. Comments from your connected <Strong>Facebook</Strong>, <Strong>Instagram</Strong>,
        and <Strong>LinkedIn</Strong> accounts are pulled into a unified inbox by a background
        worker that polls roughly every 5 minutes. LYRA&apos;s AI can then — depending on your AI
        Response Mode — draft a response for your review or post one automatically.
      </p>

      <Subsection title="How comments are collected">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Only three platforms are currently ingested into the inbox:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary">
          <li><PlatformBadge>Facebook</PlatformBadge> — comments on Page posts</li>
          <li><PlatformBadge>Instagram</PlatformBadge> — comments on feed posts and reels</li>
          <li><PlatformBadge>LinkedIn</PlatformBadge> — comments on company page posts</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The other platforms LYRA connects to are <Strong>not</Strong> ingested here today:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary">
          <li><PlatformBadge>X (Twitter)</PlatformBadge> — no comment/mention polling exists for this platform yet</li>
          <li><PlatformBadge>TikTok</PlatformBadge> — comment access isn&apos;t available through LYRA&apos;s
            connection provider for this platform, so TikTok comments never reach the inbox</li>
          <li><PlatformBadge>Google Business</PlatformBadge> — reviews are not ingested at all; there is
            no review data model in LYRA and nothing fetches them. If you need to manage Google
            reviews today, do it directly in Google Business Profile</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          A manual <Strong>Sync</Strong> button above the inbox list re-checks your Facebook,
          Instagram, and LinkedIn accounts on demand — useful if you don&apos;t want to wait for
          the next automatic poll. Comments brought in this way land as <Strong>Pending</Strong> and
          are not automatically queued for an AI draft; the automatic drafting/auto-posting
          pipeline only runs off the background poll (and, for Zernio-connected accounts, a
          real-time webhook). You can still request a draft for any individual comment at any
          time with the <Strong>Generate</Strong> button on its card.
        </p>
        <Note>
          If a workspace&apos;s AI Response Mode is set to <Strong>No reply</Strong>, the automatic
          background poll does not run for that workspace&apos;s accounts at all — only the manual
          Sync button brings comments in. This means a workspace that never opens the inbox and
          never clicks Sync won&apos;t see new comments appear on their own while autonomy is off.
        </Note>
      </Subsection>

      <Subsection title="Comment statuses explained">
        <div className="space-y-3">
          <StatusRow status="Pending" color="text-text-tertiary border-background-border-mid">
            The comment has been received but has no response yet. With <Strong>No reply</Strong> mode,
            comments stay Pending indefinitely until someone writes a manual reply — there is no
            automatic timeout or reminder. With <Strong>Post with approval</Strong> or <Strong>Full
            Automatic</Strong> mode, new comments are queued for an AI draft in the background;
            how long that takes depends on queue load, not a fixed SLA.
          </StatusRow>
          <StatusRow status="AI Drafted" color="text-status-info border-status-info/30">
            The AI has generated a draft response, shown directly in the reply box on the comment
            card. This is also the status a comment sits in while it&apos;s waiting for a human to
            review and send it under <Strong>Post with approval</Strong> mode — there is no separate
            &ldquo;Awaiting Approval&rdquo; status in the product, despite the name suggesting otherwise.
          </StatusRow>
          <StatusRow status="Responded" color="text-status-success border-status-success/30">
            A response has been sent to the platform — either an AI response under Full Automatic,
            or a reply you sent (AI-drafted or written from scratch) under any mode. Responded
            comments move to the <Strong>Done</Strong> tab.
          </StatusRow>
          <StatusRow status="Escalated" color="text-status-error border-status-error/30">
            The comment has been flagged for human attention — either by you, or by the AI when
            it hits an <Strong>Always escalate</Strong> guardrail or decides it can&apos;t respond safely.
            Escalated comments move to their own <Strong>Escalated</Strong> tab rather than staying in
            the main list; the AI will not auto-respond to them. You can still write a manual reply
            or click <Strong>Ignore</Strong> from that tab. If a Slack or Teams channel is connected
            for this workspace and the Escalated event is enabled for it, escalating a comment can
            also post an alert there.
          </StatusRow>
          <StatusRow status="Ignored" color="text-text-tertiary border-background-border-mid">
            The comment has been manually dismissed. It will not receive a response. This is
            appropriate for spam, bot activity, or comments that don&apos;t require a response
            (e.g. a simple &ldquo;❤️&rdquo;).
          </StatusRow>
        </div>
      </Subsection>

      <Subsection title="AI Response Mode">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The mode is configured per workspace in <Strong>Settings → AI Response Mode</Strong>. It
          controls how LYRA&apos;s AI responds to comments on your connected accounts.
        </p>
        <div className="space-y-4 mt-3">
          <AutonomyCard name="No reply" plan="All plans">
            Comments aren&apos;t answered automatically. You review and respond manually in the
            Inbox — the same reply box is available for every comment, whether or not an AI
            draft ever existed for it.
          </AutonomyCard>
          <AutonomyCard name="Post with approval" plan="All plans (see note below)">
            AI drafts a reply for each new comment using the brand&apos;s voice profile and any
            configured guardrails. Nothing goes live until you review it in the Inbox and click
            <Strong> Approve &amp; send</Strong>. This mode can be turned on for a Starter
            workspace, and drafts will genuinely be generated (and billed) — but the inbox UI
            that shows the &ldquo;AI draft&rdquo; label, the Generate/Re-generate button, and the
            Approve &amp; send label is hidden for Starter plans. A Starter workspace with this
            mode on will see the draft text sitting in a plain, unlabelled reply box instead.
          </AutonomyCard>
          <AutonomyCard name="Full Automatic" plan="Pro and Agency">
            AI generates and sends responses automatically with no human review step. Guardrails
            (see below) are especially important in this mode — review them before enabling it.
            This mode is available on <Strong>Pro and Agency</Strong> plans, not Agency only.
          </AutonomyCard>
        </div>
      </Subsection>

      <Subsection title="Reviewing and responding to a comment">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          There is no separate review panel or split comment/draft view — every comment card in
          the Inbox is shown fully expanded, in a single column, with the comment text, an
          optional sentiment label if one has been set, and a reply box directly beneath it.
        </p>
        <Steps>
          <Step n={1}>
            Open the Inbox. The <Strong>Pending</Strong> tab shows comments that haven&apos;t been
            responded to yet; <Strong>Escalated</Strong> and <Strong>Done</Strong> are separate tabs.
          </Step>
          <Step n={2}>
            On plans and modes where AI drafting is available, click <Strong>Generate</Strong> to
            have the AI write a draft into the reply box (or <Strong>Re-generate</Strong> if a
            draft is already there). This is optional — you can also just type directly into the
            box without generating anything first. There is no separate &ldquo;Write manually&rdquo;
            control; it&apos;s the same editable text field either way.
          </Step>
          <Step n={3}>
            Edit the text if you want to. When there is text in the box, click <Strong>Approve
            &amp; send</Strong> (shown when an AI draft was available) or <Strong>Send reply</Strong> (shown
            otherwise, e.g. on Starter or in No reply mode) to post it to the platform immediately.
          </Step>
          <Step n={4}>
            If the comment doesn&apos;t need a response, click <Strong>Ignore</Strong>. It&apos;s marked
            Ignored and won&apos;t receive a reply.
          </Step>
          <Step n={5}>
            If the comment needs human attention (a complaint, a crisis, a factual dispute), click
            <Strong> Escalate</Strong> instead. It moves to the Escalated tab; the AI will not
            respond to it automatically. You can still reply manually or ignore it from there.
          </Step>
        </Steps>
      </Subsection>

      <Subsection title="Filtering the inbox">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The inbox has one real filter today: a row of platform pills (All, plus one per
          platform present in the current comments) above the list, shown only when more than
          one platform has comments. There is no date-range filter and no sentiment filter.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Status isn&apos;t a filter either — it&apos;s the three fixed tabs (Pending, Escalated,
          Done) described above. Comments in each tab are grouped by status, not by a filter you
          can toggle on or off.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The inbox loads your <Strong>100 most recent comments</Strong> across all connected
          platforms, most recent first — it is not scoped to the last 30 days or any other date
          window. Sentiment can be shown on a comment card (Positive/Neutral/Negative/Urgent),
          but nothing in LYRA currently classifies it — in practice this field is always empty
          and the label never appears.
        </p>
      </Subsection>

      <Subsection title="Guardrails">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Guardrails are constraints the AI checks when generating comment responses for a
          workspace. They are not restricted to any plan — every plan can have guardrails.
          However, there is currently no settings screen to configure most of them. The only
          guardrail you can actually create or remove today is <Strong>Always escalate</Strong>,
          managed through the <Strong>Crisis Keywords</Strong> panel on the Brand AI page (see
          the Brand AI section of this guide) — approving a suggested keyword there, or adding
          your own, creates a live Always escalate guardrail immediately.
        </p>
        <div className="space-y-3 mt-3">
          <GuardrailRow type="Always escalate">
            Keywords that trigger an automatic escalation. Checked against the incoming
            comment&apos;s text <Strong>before</Strong> the AI generates anything — a match skips
            generation entirely and the comment is escalated straight away, so no AI call is
            made (and nothing is billed) for a comment that matches. Managed from the Crisis
            Keywords panel on the Brand AI page, not from a Guardrails settings screen.
          </GuardrailRow>
          <GuardrailRow type="Never discuss / Never use word">
            Topics or specific words the AI should avoid in its responses. These exist in
            LYRA&apos;s response-generation logic — if the AI&apos;s generated reply contains a
            restricted word, or mentions a restricted topic, the reply is discarded and the
            comment is escalated instead of being sent. This check runs <Strong>after</Strong> the
            AI has already generated a response (and the API call has already been billed), as a
            substring match against the generated text — it is not a check of what the incoming
            comment is about, and it is not a topic classifier. There is currently no screen
            anywhere in LYRA to create a guardrail of either type, so in practice this check
            never has anything to match against.
          </GuardrailRow>
          <GuardrailRow type="Approved answer">
            Pre-written text for common questions. If any exist for a workspace, they&apos;re
            included in the prompt as a hint the AI can draw on — the model may use one
            verbatim, paraphrase it, ignore it, or write something else entirely. There is no
            trigger-matching that forces an approved answer to be used for a specific question,
            and no factual-accuracy guarantee. As with Never discuss/Never use word, there is
            currently no screen to create one, so this has no practical effect today.
          </GuardrailRow>
        </div>
      </Subsection>
    </section>
  )
}
