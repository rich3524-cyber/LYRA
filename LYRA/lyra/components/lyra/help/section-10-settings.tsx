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

      <Subsection title="Workspace settings — what&apos;s actually here">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          There is no general workspace-editing screen. Of the fields set when a workspace is
          created — name, website URL, industry — none can be changed afterwards from Settings.
          <Strong> Industry</Strong> in particular is a display-only field: it is shown on the
          agency&apos;s Clients list and in the workspace dashboard header, but no service reads
          it when building an AI prompt, so it has no effect on caption tone, comment replies, or
          anything else the AI generates.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          What Settings actually contains: Social Accounts, <Strong>Timezone</Strong> (the one
          creation-time field that is editable afterwards), <Strong>AI Response Mode</Strong>{' '}
          (autonomy), the <Strong>LYRA Trend</Strong> and <Strong>Crisis Aware</Strong> add-ons,
          Approval deadlines (once client approval is on), Team Notifications, Email Marketing,
          and Danger Zone. Each is covered below.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Social Accounts">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Lists each supported platform (Facebook, Instagram, LinkedIn, Google Business,
          X (Twitter), TikTok, YouTube) with a <Strong>Connect</Strong> button. For a platform with
          at least one connected account, each one shows its <Strong>name</Strong> and{' '}
          <Strong>platform label</Strong> — nothing else. There is no status badge, no token
          expiry date, and no connection date shown here.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          A connected account also gets a <Strong>Reconnect</Strong> button and a{' '}
          <Strong>Disconnect</Strong> link. Disconnect is a single click with no confirmation
          dialog — it deactivates the account immediately, removing it from this list. It does
          not revoke or delete the underlying access token, but that doesn&apos;t make Reconnect
          any faster: Reconnect runs the exact same authorization flow as a fresh Connect, and a
          fresh token replaces the stored one every time — for Facebook it explicitly forces the
          platform&apos;s consent screen to show again. There is no shortcut that skips
          re-authorizing on the platform side. See the <Strong>Social Connections</Strong> section
          for the connect flow itself.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Timezone">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The one field carried over from workspace creation that stays editable. Despite the
          description shown next to it in the app, it is not currently used by the manual
          composer or by dragging posts on the calendar — those scheduling times are not
          converted through this setting. It does have two real uses elsewhere: when scheduling
          posts from a CSV via <Strong>bulk import</Strong>, each row&apos;s date and time is read
          and converted using this timezone; and the &quot;Scheduled&quot; timestamp shown in
          every <Strong>Team Notifications</Strong> Slack message is formatted in it too. Analytics
          does not use it at all; daily breakdowns there are bucketed by{' '}
          <Strong>your own browser&apos;s</Strong> local timezone, which means two people viewing
          the same workspace&apos;s analytics from different time zones can see different daily
          totals for the same day.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — AI Response Mode">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Sets how the AI responds to comments on this workspace&apos;s connected accounts. Three
          options:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>No reply</Strong> — comments aren&apos;t answered automatically. Review and
            respond manually in the Inbox.
          </li>
          <li>
            <Strong>Post with approval</Strong> — the AI drafts a reply for each comment, but
            nothing goes live until you approve it in the Inbox.
          </li>
          <li>
            <Strong>Full Automatic</Strong> — the AI replies to comments instantly with no review.
            Requires Pro or Agency; on Starter this option is shown but disabled. Switching to it
            asks for confirmation first, since replies go live with no review from that point on.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Changing modes takes effect immediately for new incoming comments. See the{' '}
          <Strong>Inbox</Strong> section for what each mode looks like day to day.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Crisis Aware">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Included on the Agency plan, or available on Pro as a paid add-on. A single toggle
          (or, on Pro without the add-on, an <Strong>Activate</Strong> button that starts
          checkout) that turns on real-time monitoring for reputational risk. When on, LYRA
          watches incoming comments and, on a match, auto-pauses scheduled posts for the workspace
          and alerts you.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The only way to add to what Crisis Aware watches for is the{' '}
          <Strong>Crisis Keywords</Strong> panel on the <Strong>Brand AI</Strong> page — see the
          next subsection. There is no configuration screen inside Settings itself for this.
        </p>
      </Subsection>

      <Subsection title="Guardrails — there is no Guardrails settings screen">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA does not have a dedicated Guardrails configuration page, and guardrail enforcement
          is not gated by plan. The one real guardrail-adjacent control that exists is{' '}
          <Strong>Crisis Keywords</Strong>, on the <Strong>Brand AI</Strong> page (not Settings).
          It creates only one guardrail type — <Strong>Always escalate</Strong> — for specific
          words or phrases: a comment containing one instantly escalates to a human instead of
          being auto-replied to. Brand AI suggests candidate keywords automatically; you approve
          or dismiss each suggestion, or add your own directly.
        </p>
        <Note>
          The Crisis Keywords panel only renders once Crisis Aware is turned on for the workspace,
          and Crisis Aware itself requires Pro (with the add-on) or Agency. In practice this means
          a Starter workspace has no way to create any guardrail at all, even though nothing in
          the enforcement logic itself checks plan.
        </Note>
      </Subsection>

      <Subsection title="Workspace settings — Client Access">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Client Access is not a Settings-page control — it is chosen once, when the workspace is
          created, and there is currently no screen to change it afterwards. The levels are{' '}
          <Strong>None</Strong> (client has no access), <Strong>View</Strong> (client can view the
          calendar and analytics), and <Strong>Approve</Strong> (client can approve or reject
          posts submitted for approval).
        </p>
        <Note>
          LYRA does have a real, token-based client onboarding link (opens a short form for
          website URL, industry, and a brand brief) — but it is a separate, narrower flow from
          Client Access above: completing it doesn&apos;t grant any dashboard access, calendar
          view, or approval rights. Email also still never notifies anyone that a post is waiting
          for approval — see the <Strong>Compose</Strong> section for how that works today. On
          Agency plan, or Pro with the Crisis Aware add-on, a connected{' '}
          <Strong>Team Notifications</Strong> Slack channel below does cover this — see that
          subsection.
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
            scheduled date, the deadline counts back from that time.
          </li>
          <li>
            <Strong>Hours since submission, if no time is set</Strong> — for a post with no
            scheduled date, the deadline counts forward from when it was submitted.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          A post past its deadline is flagged in the calendar, and alerts your connected
          notification channel once (see <Strong>Team Notifications</Strong> below, if one is
          connected and that event is enabled). Only a workspace owner or agency admin can change
          these values.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Team Notifications">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Included on the Agency plan, or available on Pro with the Crisis Aware add-on. Sends
          alerts to a shared Slack channel so the whole team sees them at once, instead of relying
          on one person to check email or forward a message. Email stays on regardless — this is
          an addition, not a replacement.
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Connect Slack</Strong> — one click, no Slack App to create and no webhook
            URL to paste in. One channel per workspace. Public channels are joined
            automatically; for a private channel, run <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md">/invite @Zernio</code>{' '}
            in it first, since an app cannot add itself to a private channel. Only a workspace
            owner or agency admin can connect or manage the channel.
          </li>
          <li>
            <Strong>Events</Strong> — each event has its own on/off toggle, configured per
            workspace.
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
          If a channel logs several failed deliveries in a row, a warning appears here with the
          error — reconnect, or confirm the channel still exists. Email alerts keep working
          throughout, since they don&apos;t depend on Slack being up.
        </Note>
      </Subsection>

      <Subsection title="Workspace settings — Email Marketing">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          A read-only integration with your email platform — <Strong>Klaviyo</Strong>,{' '}
          <Strong>Mailchimp</Strong>, or <Strong>Customer.io</Strong>. Connect by pasting an API
          key from that platform (Settings shows where to find it for each). Once connected,
          scheduled email campaigns from that platform appear in the Content Calendar alongside
          your social posts, so you can see everything going out to an audience in one place.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Each connected provider shows its account name and last sync time, with a{' '}
          <Strong>Sync</Strong> button to refresh on demand and a <Strong>Disconnect</Strong>{' '}
          link to remove it. LYRA does not send or schedule email campaigns itself through this
          integration — it only reads what already exists in the connected platform.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Add-ons">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Alongside Crisis Aware, Settings shows a <Strong>LYRA Trend</Strong> card — daily
          AI-scored trend intelligence matched to your brand. For every workspace today it reads
          &quot;Coming soon&quot; rather than offering anything to activate — there is no checkout
          flow wired up for it yet, so this is not reachable in practice.
        </p>
      </Subsection>

      <Subsection title="Workspace settings — Danger Zone">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Contains the <Strong>Delete workspace</Strong> action. Clicking it opens a confirmation
          dialog describing what will be deleted — there is no type-the-workspace-name field, just
          Cancel and a second, explicit <Strong>Delete workspace</Strong> button. Confirming
          deletes the workspace and all its data — social accounts, posts, comments, brand
          profile — synchronously, in that same request; there is no delay or grace window
          afterwards. Only a workspace owner can actually complete the deletion — the button
          itself is visible to anyone who can see this page, but a non-owner who clicks through
          gets a generic error rather than a permission message.
        </p>
      </Subsection>

      <Subsection title="Account settings — Profile">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The account page shows your name, email, and avatar, but none of it is editable here —
          profile details are managed through your login provider (Google, or whichever method
          you signed up with). This page also shows your current plan and, for a founding member,
          that badge and the locked-in pricing note, with a link out to Manage billing. Its own
          Danger Zone at the bottom has a <Strong>Delete account</Strong> action, separate from
          deleting an individual workspace below.
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
          (see <Strong>Workspace settings → Crisis Aware</Strong> above). It comes from{' '}
          <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md">notifications@lyraonline.ai</code>.
          No other event triggers an email today. A connected Slack channel (Agency plan, or Pro
          with the Crisis Aware add-on — see <Strong>Workspace settings → Team Notifications</Strong>{' '}
          above) adds a failed-post alert and a few others, but not everything you might expect:
          there is currently no notification anywhere, email or Slack, for a token expiring or for
          a client&apos;s approve/reject decision on a post — check the relevant screen in LYRA
          directly for those instead.
        </p>
      </Subsection>
    </section>
  )
}
