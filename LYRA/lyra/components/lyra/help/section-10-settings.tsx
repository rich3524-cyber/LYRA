import { SectionHeader, Subsection, Strong, Note } from './primitives'

export function SettingsSection() {
  return (
    <section id="settings" className="space-y-8 scroll-mt-28">
      <SectionHeader n="10" title="Settings" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        Settings are split into two levels: <Strong>workspace settings</Strong> (different for
        each client) and <Strong>account settings</Strong> (global to your LYRA account).
        Access workspace settings from the <Strong>Settings</Strong> link at the bottom of the
        sidebar when inside a workspace. Access account settings by clicking your avatar in the
        top-right corner of any page.
      </p>

      <Subsection title="Workspace settings — General">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Covers the core workspace configuration:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Workspace name</Strong> — the internal name used in the workspace switcher
            and throughout the app. Not shown to the client unless you share the screen.
          </li>
          <li>
            <Strong>Website URL</Strong> — the client&apos;s primary website, used for brand
            intelligence crawling and for the SEO module. Changing this and saving will prompt
            you to rebuild the brand profile.
          </li>
          <li>
            <Strong>Industry</Strong> — helps the AI contextualise tone and content angle.
            Choose the most specific match available.
          </li>
          <li>
            <Strong>Timezone</Strong> — the client&apos;s local timezone. All post scheduling times
            displayed in the composer and calendar use this timezone. Analytics also display
            daily breakpoints in this timezone.
          </li>
        </ul>
      </Subsection>

      <Subsection title="Workspace settings — Social Accounts">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Lists all connected social accounts for this workspace. For each account you can see:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>Platform and page/account name</li>
          <li>Connection status (Connected, Token expired, Disconnected)</li>
          <li>Token expiry date</li>
          <li>Date the account was connected</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          From here you can Connect new accounts, Reconnect expired ones, and Disconnect
          existing ones. See the <Strong>Social Connections</Strong> section for full details.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — AI Autonomy">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Sets the AI response mode for this workspace&apos;s inbox. Three options are available
          depending on your plan: Off, Draft + Approve, and Full Autonomy. See the
          <Strong> Inbox</Strong> section for a full explanation of each mode.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Changes to the autonomy setting take effect immediately. Any existing comments
          in the inbox that are Awaiting Approval will remain unchanged — only new
          incoming comments are affected.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Crisis Aware">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Available on Pro and Agency plans. A single toggle that turns on real-time
          monitoring for reputational risk. When on, LYRA watches every incoming comment for:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>A sentiment spike</Strong> — 3 or more genuinely negative comments
            landing close together.
          </li>
          <li>
            <Strong>A keyword match</Strong> — any comment containing a word from the
            workspace&apos;s escalation keyword list. Brand Intelligence suggests this list
            automatically, tailored to the business — see the <Strong>Brand Intelligence</Strong> section
            for how to review and approve suggestions.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Either trigger pauses all scheduled posts for the workspace immediately — nothing
          publishes while a crisis is active — and shows a red banner across the dashboard
          with the trigger time. Click <Strong>Resolve</Strong> on the banner once the
          situation is handled; scheduled posts resume automatically.
        </p>
        <Note>
          Crisis Aware sends an email alert — with the trigger reason and a link to the
          workspace — to every workspace owner/admin, in addition to the in-app banner.
          See <Strong>Account settings → Notifications</Strong> below for details.
        </Note>
      </Subsection>

      <Subsection title="Workspace settings — Guardrails">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Available on Agency plan. Lets you define constraints for the AI&apos;s response behaviour.
          Four guardrail types: Never discuss, Never use word, Always escalate, and Approved answers.
          See the <Strong>Inbox</Strong> section for a full explanation of each type.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Guardrails are applied workspace-wide. If you need different guardrails for different
          campaigns or post types, use the Approved Answers guardrail to create specific
          pre-approved responses that override the general AI generation.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Client Access">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Available on Pro and Agency plans. Controls what your client can see and do:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Access level</Strong> — None (client has no access), View (client can
            view the calendar and analytics), or Approve (client can approve or reject posts
            submitted for approval).
          </li>
        </ul>
        <Note>
          There is still no self-service client onboarding link, and email never notifies
          anyone that a post is waiting for approval — see <Strong>Social Connections →
          Connecting accounts on a client&apos;s behalf</Strong> and the <Strong>Compose</Strong>{' '}
          section for how those work today. On Agency plan (or Pro with Crisis Aware), a
          connected <Strong>Team Notifications</Strong> Slack channel below does cover this —
          see that subsection.
        </Note>
        <Note>
          A post&apos;s own author normally can&apos;t approve it themselves. The one
          exception: if nobody else on the workspace has approval permissions — for example a
          solo operator who turns on client approval before a real second reviewer has been
          added — self-approval is allowed, and clearly labeled
          (<Strong>Approve (no other reviewer available)</Strong>) so it&apos;s obvious no real
          second-party review took place.
        </Note>
      </Subsection>

      <Subsection title="Workspace settings — Approvals (deadlines)">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Only shown once <Strong>Client Access</Strong> above is set to Approve. Sets how long a
          post can sit waiting for a reviewer before it is flagged overdue:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Hours before a post&apos;s scheduled time</Strong> — for a post with a
            scheduled date, the deadline counts back from that time. Defaults to 4 hours.
          </li>
          <li>
            <Strong>Hours since submission, if no time is set</Strong> — for a post with no
            scheduled date, the deadline counts forward from when it was submitted. Defaults
            to 24 hours.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          An overdue post shows an <Strong>Approval overdue</Strong> badge in the calendar and
          post detail panel immediately — this is calculated live, not on a delay. An hourly
          check separately fires one <Strong>Approval overdue</Strong> alert per post to the
          workspace&apos;s connected Slack channel (see <Strong>Team Notifications</Strong>{' '}
          below), if one is connected and that event is enabled. Approving, rejecting, or
          resubmitting the post resets its deadline.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Team Notifications">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Available on Agency plan, or Pro with the Crisis Aware add-on. Sends alerts to a
          shared Slack channel so the whole team sees them at once, instead of relying on one
          person to check email or forward a message. Email stays on regardless — this is an
          addition, not a replacement.
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Connect Slack</Strong> — one click, no Slack App to create and no webhook
            URL to paste in. One channel per workspace. Public channels are joined
            automatically; for a private channel, run <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md">/invite @Zernio</code>{' '}
            in it first, since an app cannot add itself to a private channel.
          </li>
          <li>
            <Strong>Events</Strong> — five are configurable per workspace, each with its own
            on/off toggle: Crisis detected, Post failed to publish, New post pending approval,
            and Approval overdue (all on by default), plus Post published (off by default —
            the noisiest one).
          </li>
          <li>
            <Strong>Send test</Strong> — sends a real message immediately so you can confirm
            delivery and see how it looks, without waiting for a real event.
          </li>
          <li>
            <Strong>Disconnect</Strong> — removes the channel from LYRA only. The Slack app
            itself stays installed in your Slack workspace until removed there directly.
          </li>
        </ul>
        <Note>
          Messages arrive under LYRA&apos;s own name and icon in Slack, not a generic bot
          identity. If a channel logs several failed deliveries in a row, a warning appears
          here with the error — reconnect, or confirm the channel still exists. Crisis alerts
          keep working over email throughout, since email never depends on Slack being up.
        </Note>
      </Subsection>

      <Subsection title="Workspace settings — Integrations">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Shows the status of third-party integrations for this workspace. Currently includes:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            <Strong>Google Search Console</Strong> — connect or disconnect the GSC property.
            Shows the connected property URL and last sync timestamp.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Additional integrations will appear here as they are added in future LYRA updates.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Danger Zone">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Contains the <Strong>Delete workspace</Strong> action. This is irreversible. You must
          type the workspace name to confirm. All data associated with the workspace — posts,
          comments, brand profile, analytics, social tokens — is permanently deleted within
          30 seconds of confirmation.
        </p>
      </Subsection>

      <Subsection title="Account settings — Profile">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Update your display name, profile photo, and email address. If you signed up with
          Google, your name and photo are pulled from your Google account automatically, but
          you can override them here. Email address changes require a verification step.
        </p>
      </Subsection>

      <Subsection title="Account settings — Notifications">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Configurable, per-event email notification preferences (escalated comments, failed
          posts, token expiry, approvals, billing) are not built yet — this is a planned,
          larger notification-preferences project, not yet scheduled.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The one email LYRA sends today is a <Strong>Crisis Aware alert</Strong> — automatically,
          with no on/off setting — to every workspace owner/admin when Crisis Aware triggers
          (see <Strong>Workspace settings → Crisis Aware</Strong> below). It comes from{' '}
          <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md">notifications@lyraonline.ai</code>.
          No other event (a failed post, an expired token, a client approval decision) triggers
          an email today — check the relevant screen in LYRA directly instead, or connect a
          Slack channel under <Strong>Workspace settings → Team Notifications</Strong> above,
          which does cover those events on Agency plan or Pro with Crisis Aware.
        </p>
      </Subsection>
    </section>
  )
}
