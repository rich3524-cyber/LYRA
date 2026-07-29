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
          Crisis Aware&apos;s alert is in-app only right now (the banner, plus the paused
          posts) — there is no email or push notification when it triggers. Someone needs
          to have LYRA open to see it. Email alerting is planned.
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
          <li>
            <Strong>Onboarding link</Strong> — generate a one-time link for the client to
            connect their own social accounts. Links expire after 7 days.
          </li>
          <li>
            <Strong>Approval notifications</Strong> — toggle whether the client receives email
            notifications when posts are submitted for their approval. Also configure the
            reminder frequency if they haven&apos;t responded.
          </li>
        </ul>
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
          an email today — check the relevant screen in LYRA directly instead.
        </p>
      </Subsection>
    </section>
  )
}
