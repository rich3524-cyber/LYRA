import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step, Note, StatusBadge } from './primitives'

function PlatformRow({ name, availability, children }: { name: string; availability: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 rounded-xl bg-background-secondary border border-background-border space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm font-medium text-text-primary">{name}</p>
        <span className={`font-sans text-xs px-2 py-0.5 rounded-md border ${
          availability === 'Full'
            ? 'text-status-success border-status-success/30 bg-status-success/10'
            : 'text-status-info border-status-info/30 bg-status-info/10'
        }`}>
          {availability === 'Full' ? 'Full support' : 'Available'}
        </span>
      </div>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

function PermRow({ platform, permission, children }: { platform: string; permission: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-background-secondary border border-background-border space-y-2">
      <div className="flex items-start justify-between gap-4">
        <p className="font-sans text-xs font-medium text-text-primary shrink-0">{platform}</p>
        <p className="font-mono text-[11px] text-text-tertiary text-right leading-relaxed">{permission}</p>
      </div>
      <p className="font-sans text-xs text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

export function SocialConnectionsSection() {
  return (
    <section id="social-connections" className="space-y-8 scroll-mt-28">
      <SectionHeader n="03" title="Social Connections" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA connects to social media platforms using <Strong>OAuth 2.0</Strong> — the same
        industry-standard authorisation protocol used by every major third-party app. You never
        share your platform passwords with LYRA. When you connect a platform, the connection is
        brokered through <Strong>Zernio</Strong>, a third-party social-platform integration
        service LYRA uses to talk to each platform&apos;s API. For every account connected today,
        Zernio — not LYRA — holds the actual OAuth access token; LYRA stores only a reference id
        that tells Zernio which of your connected accounts to use. When you initiate an action, or
        when the AI responds to a comment, LYRA calls Zernio with that reference id, and Zernio
        calls the platform using the token it holds on your behalf.
      </p>

      <Subsection title="Supported platforms">
        <div className="space-y-4">
          <PlatformRow name="Facebook" availability="Full">
            Facebook Pages are fully supported — scheduling posts, reading and responding to
            comments, and publishing to the Page feed. Requires you to be an admin of the Page.
            Personal profiles are not supported.
          </PlatformRow>
          <PlatformRow name="Instagram" availability="Full">
            Instagram Business and Creator accounts are fully supported — scheduling feed posts
            and multi-image carousels, reading and responding to comments, and accessing
            insights. Instagram connects independently, with its own Connect button, the same way
            as every other platform — you don&apos;t need to connect Facebook first, and
            connecting Facebook doesn&apos;t automatically add your Instagram account.
          </PlatformRow>
          <PlatformRow name="LinkedIn" availability="Full">
            LinkedIn Company Pages are supported for post scheduling and comment reading.
            Comment response via API is available but subject to LinkedIn rate limits.
            Requires admin access to the company Page. Personal profiles are not supported.
          </PlatformRow>
          <PlatformRow name="Google Business" availability="Available">
            Google Business Profile (formerly Google My Business) connections can be used to
            publish posts/updates the same way as any other connected platform. Review reading
            and response — historically Google Business&apos;s flagship use case — is
            <Strong> not currently functional</Strong>: LYRA has no database record for storing
            reviews, the code path that would fetch or reply to them is never called from
            anywhere in the app, and Google Business accounts are explicitly excluded from
            LYRA&apos;s automated comment/review sync. Requires a verified Google Business
            Profile and admin access.
          </PlatformRow>
          <PlatformRow name="X (Twitter)" availability="Available">
            X (formerly Twitter) is supported for post scheduling and timeline publishing, and
            for reading and replying to comments through LYRA&apos;s automated monitoring.
          </PlatformRow>
          <PlatformRow name="TikTok" availability="Available">
            TikTok Business accounts are supported for post scheduling.
            <Strong> Comment reading and replying is not currently functional</Strong> — TikTok
            comments are not supported through LYRA&apos;s current connection, and this is a
            known, permanent condition rather than a temporary API limitation.
          </PlatformRow>
          <PlatformRow name="YouTube" availability="Available">
            YouTube channels are supported for publishing videos, and are included in LYRA&apos;s
            automated comment monitoring the same way as other platforms. Unlike TikTok (see
            above), this hasn&apos;t produced a known failure — but it also hasn&apos;t been
            independently confirmed to work end-to-end for YouTube specifically. Requires you to
            be the owner or a manager of the connected channel.
          </PlatformRow>
        </div>
      </Subsection>

      <Subsection title="Connecting an account">
        <Steps>
          <Step n={1}>
            Open the workspace, then go to <Strong>Settings</Strong>. Under
            <Strong> Social Accounts</Strong>, you&apos;ll see every supported platform with its
            current connection status.
          </Step>
          <Step n={2}>
            Click <Strong>Connect</Strong> (or <Strong>Reconnect</Strong>, if the platform is
            already connected) next to the platform you want.
          </Step>
          <Step n={3}>
            You&apos;re redirected through Zernio and then to the platform&apos;s own sign-in and
            OAuth consent screen. Sign in with the account that owns the Page, channel, or
            profile you want to manage.
          </Step>
          <Step n={4}>
            Review the permissions the platform&apos;s consent screen lists and grant access. For
            Facebook specifically, this consent screen is also where you choose which Page(s) to
            grant access to — LYRA does not show a separate page-picker afterward, so make sure
            you explicitly select every Page you want connected before continuing (see
            Troubleshooting below if a Page you granted still doesn&apos;t show up).
          </Step>
          <Step n={5}>
            You are redirected back to LYRA&apos;s Settings page. The account appears in the list
            with a small green dot next to its name and platform label — there&apos;s no
            &ldquo;Connected&rdquo; text badge on the row itself, just the dot indicator.
          </Step>
        </Steps>
        <Note>
          You can connect the same Facebook Page, Instagram account, or LinkedIn company Page to
          multiple workspaces — useful if different teams manage different aspects of the same
          brand. Each workspace maintains independent post queues and inboxes. Each
          workspace&apos;s connection is a separate account on Zernio&apos;s side, and Zernio
          bills per connected account rather than per underlying social profile — so connecting
          the same Page to three workspaces creates three separately billed Zernio accounts, not
          one shared one.
        </Note>
      </Subsection>

      <Subsection title="Permissions requested at connect time">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA&apos;s own code doesn&apos;t specify which OAuth permissions to request. Every
          connection today routes through Zernio, and the permissions shown on each
          platform&apos;s consent screen are configured within Zernio&apos;s own app registration
          for that platform, not inside LYRA. That means the exact permission list isn&apos;t
          something LYRA can fully document here, and it may include more than the minimum
          LYRA&apos;s features need — for example, Facebook/Instagram connections could request
          business- or ads-management-level access beyond basic Page posting and comments, and X
          connections could request offline (refresh-token) access beyond simple read/write. The
          platform&apos;s own consent screen at connect time is the authoritative list of what
          you&apos;re actually granting — what&apos;s below is only what LYRA&apos;s features use
          once a connection exists.
        </p>
        <div className="space-y-3 mt-3">
          <PermRow platform="Facebook / Instagram" permission="Set by Zernio's app, not LYRA's code">
            Used to publish posts, read Page and Instagram content, and read and reply to
            comments.
          </PermRow>
          <PermRow platform="LinkedIn" permission="Set by Zernio's app, not LYRA's code">
            Used to publish to and read company Pages. LYRA does not read personal profile data.
          </PermRow>
          <PermRow platform="Google Business" permission="Set by Zernio's app, not LYRA's code">
            Used to publish posts/updates to your Business Profile. Review reading and response
            is not currently functional in LYRA (see Supported platforms above), so this
            connection is not used for reviews today regardless of what&apos;s granted.
          </PermRow>
          <PermRow platform="X (Twitter)" permission="Set by Zernio's app, not LYRA's code">
            Used to post and read replies. May also include offline/refresh-token access, needed
            to keep the connection working without you re-authorising frequently.
          </PermRow>
          <PermRow platform="TikTok" permission="Set by Zernio's app, not LYRA's code">
            Used to publish videos and read and reply to comments where TikTok&apos;s API allows
            it.
          </PermRow>
          <PermRow platform="YouTube" permission="Set by Zernio's app, not LYRA's code">
            Used to publish videos and read and reply to comments on your channel.
          </PermRow>
        </div>
      </Subsection>

      <Subsection title="Reconnecting an expired account">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Social platform access tokens expire periodically (typically every 60–90 days for
          most platforms). LYRA does not currently detect an expired token proactively or show
          a dedicated warning badge for it — a bad or expired token surfaces the same way any
          other publish failure does: the affected post shows a
          <StatusBadge color="text-status-error border-status-error/30">Failed</StatusBadge> status
          on the content calendar, with the underlying platform error message attached.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          If you suspect a connection has gone stale (repeated failures on one platform, or it's
          been several months since you last connected it), click <Strong>Reconnect</Strong> next
          to that account in <Strong>Settings</Strong> and go through the authorisation flow
          again — this works at any time, not just after a detected failure. Reconnect always
          runs a full authorisation through Zernio again; there&apos;s no separate
          &ldquo;refresh permissions only&rdquo; option, so it&apos;s also the way to grant
          permissions you may have declined the first time.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Posts that failed while the connection was broken are not deleted — check the content
          calendar for any posts with a <StatusBadge color="text-status-error border-status-error/30">Failed</StatusBadge> status
          and reschedule or republish them manually after reconnecting.
        </p>
      </Subsection>

      <Subsection title="Disconnecting an account">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          In <Strong>Settings</Strong>, click <Strong>Disconnect</Strong> directly next to any
          connected account under Social Accounts. There is no confirmation dialog and no
          three-dot or overflow menu — Disconnect is its own button, and it takes effect as soon
          as you click it.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Disconnecting does <Strong>not</Strong> revoke or delete the stored access token. It
          only marks the account inactive in LYRA&apos;s database — the token itself, held by
          Zernio for accounts connected through the current flow, is retained indefinitely, not
          deleted. Marking the account inactive immediately stops LYRA&apos;s comment/review
          monitoring and blocks scheduling any <Strong>new</Strong> post to that account.
        </p>
        <Note>
          Disconnecting does <Strong>not</Strong> stop a post that was already scheduled before
          you disconnected — LYRA&apos;s publish step does not check whether the account is
          still active, so an already-scheduled post will still go out at its scheduled time,
          even to a disconnected account. If you disconnect an account, also cancel or
          reschedule anything already queued for it from the content calendar.
        </Note>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Disconnecting in LYRA does not revoke anything on the platform&apos;s side either. To
          fully cut off access, remove the connected app from the platform&apos;s own
          authorised-apps list (for example, Facebook Settings &amp; Privacy → Settings →
          Business Integrations). Look for whichever integration is listed there — it may be
          registered under Zernio&apos;s name rather than LYRA&apos;s, since Zernio is the
          service that actually completes the OAuth connection today.
        </p>
      </Subsection>

      <Subsection title="Troubleshooting: Facebook says no Page was found">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Occasionally a Facebook connection attempt completes the consent screen but LYRA still
          shows an error saying no Facebook Page could be found, even though you are an admin of
          the Page and explicitly granted it access.
        </p>
        <Steps>
          <Step n={1}>
            Double-check you are signed in as the personal Facebook profile that actually
            administers the Page, not just viewing it through Meta Business Suite — the Page
            lookup depends on the logged-in profile granting access.
          </Step>
          <Step n={2}>
            On the consent screen, make sure you explicitly selected the Page in Facebook&apos;s
            own page-permission list, rather than just accepting a summary that already shows it
            as checked.
          </Step>
          <Step n={3}>
            If it still fails after that, don&apos;t keep repeating a Facebook
            remove-and-reconnect cycle. LYRA&apos;s own error message for this exact failure
            already tells you the problem is on Zernio&apos;s side, not fixable from LYRA&apos;s
            or Facebook&apos;s settings — contact Zernio support directly, referencing error code
            <Strong> no_facebook_pages</Strong>, and note that the Page was explicitly granted
            during consent.
          </Step>
        </Steps>
        <Note>
          This is the live wording LYRA shows for this failure: &ldquo;Zernio couldn&apos;t find
          a Facebook Page to connect, even though you selected the Page and granted access on
          Facebook&apos;s own consent screen. This is confirmed to be an issue on Zernio&apos;s
          side, not something fixable from LYRA or your Facebook settings — contact Zernio
          support and reference error code &lsquo;no_facebook_pages&rsquo; on a connection where
          the Page was explicitly granted during consent.&rdquo;
        </Note>
      </Subsection>

      <Subsection title="Connecting accounts on a client's behalf">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          A self-service client onboarding link (where a client connects their own accounts
          without you ever seeing their credentials) is not built yet. Today, connecting an
          account for a client works the same way as any other connect — someone with access to
          the workspace, and permission on the platform side (an admin of the Page, company page,
          or Business Profile), goes through <Strong>Settings → Social Accounts → Connect</Strong>
          directly. In practice this usually means the client shares admin access to the relevant
          Page/account with you first, or connects it themselves by logging into that workspace.
        </p>
      </Subsection>
    </section>
  )
}
