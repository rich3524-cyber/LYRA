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
        share passwords. When you connect a platform, the platform asks you to grant specific
        permissions (such as &ldquo;manage posts&rdquo; or &ldquo;read comments&rdquo;). LYRA stores only the OAuth
        access token — encrypted at rest using AES-256-GCM — and uses it exclusively to act on
        your behalf when you initiate an action or when the AI responds to a comment.
      </p>

      <Subsection title="Supported platforms">
        <div className="space-y-4">
          <PlatformRow name="Facebook" availability="Full">
            Facebook Pages are fully supported — scheduling posts, reading and responding to
            comments, and publishing to the page feed. Requires you to be an admin of the Page.
            Personal profiles are not supported. Facebook is connected via the Facebook Login
            OAuth flow and uses the Graph API v19.0.
          </PlatformRow>
          <PlatformRow name="Instagram" availability="Full">
            Instagram Business and Creator accounts connected to a Facebook Page are fully
            supported. Scheduling feed posts, reels, carousels, and stories; reading and
            responding to comments; and accessing insights. Instagram is connected through the
            same Facebook Graph API connection — you connect Facebook first, and Instagram pages
            linked to that account become available automatically.
          </PlatformRow>
          <PlatformRow name="LinkedIn" availability="Full">
            LinkedIn Company Pages are supported for post scheduling and comment reading.
            Comment response via API is available but subject to LinkedIn rate limits.
            Requires you to be a Super Admin or Content Admin of the company page. Personal
            profiles are not supported.
          </PlatformRow>
          <PlatformRow name="Google Business" availability="Full">
            Google Business Profile (formerly Google My Business) is fully supported for
            review reading and response. Responding to Google reviews is one of LYRA&apos;s most
            impactful features — reviews have a significant effect on local SEO. Requires a
            verified Google Business Profile and admin access.
          </PlatformRow>
          <PlatformRow name="X (Twitter)" availability="Available">
            X (formerly Twitter) is supported for post scheduling and timeline publishing.
            Comment/reply monitoring is available but at reduced frequency due to elevated
            API costs on X&apos;s current pricing model. Rate limits apply per workspace.
          </PlatformRow>
          <PlatformRow name="TikTok" availability="Available">
            TikTok Business accounts are supported for post scheduling. Comment reading and
            response is available through the TikTok for Business API, which is still maturing.
            Availability may be subject to TikTok API access approval for your account.
          </PlatformRow>
        </div>
      </Subsection>

      <Subsection title="Connecting an account">
        <Steps>
          <Step n={1}>
            Open the workspace, then go to <Strong>Settings → Social Accounts</Strong>.
            You will see a list of all supported platforms with their current connection status.
          </Step>
          <Step n={2}>
            Click <Strong>Connect</Strong> next to the platform you want to connect.
          </Step>
          <Step n={3}>
            A browser popup or redirect opens to the platform&apos;s OAuth authorisation page.
            Sign in to the account that owns the Page or profile you want to manage.
          </Step>
          <Step n={4}>
            The platform will list the specific permissions LYRA is requesting. Review them and
            click <Strong>Allow</Strong> or <Strong>Authorise</Strong> to proceed.
          </Step>
          <Step n={5}>
            For platforms that support multiple pages (Facebook, Google Business, LinkedIn),
            LYRA will show a picker listing every page or account associated with that login.
            Select the specific page you want to connect to this workspace.
          </Step>
          <Step n={6}>
            You are redirected back to LYRA. The account appears in the list with a
            <StatusBadge color="text-status-success border-status-success/30">Connected</StatusBadge>
            indicator and the page name.
          </Step>
        </Steps>
        <Note>
          You can connect the same Facebook page, Instagram account, or LinkedIn company to
          multiple workspaces — useful if different teams manage different aspects of the
          same brand. Each workspace maintains independent post queues and inboxes.
        </Note>
      </Subsection>

      <Subsection title="Permissions LYRA requests by platform">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA requests only the minimum permissions needed to operate. Here is what each platform
          grants and why:
        </p>
        <div className="space-y-3 mt-3">
          <PermRow platform="Facebook / Instagram" permission="pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish, instagram_manage_comments">
            Required to publish posts, read the post feed, and read and reply to comments on
            Facebook Pages and connected Instagram accounts.
          </PermRow>
          <PermRow platform="LinkedIn" permission="r_organization_social, w_organization_social, r_basicprofile">
            Required to post to company pages and read company page content. LYRA does not
            read personal profile data.
          </PermRow>
          <PermRow platform="Google Business" permission="business.manage">
            Required to read and reply to Google Reviews on your Business Profile listings.
          </PermRow>
          <PermRow platform="X (Twitter)" permission="tweet.read, tweet.write, users.read">
            Required to post tweets and read replies to managed accounts.
          </PermRow>
          <PermRow platform="TikTok" permission="video.publish, video.list, comment.list, comment.post">
            Required to publish videos and read and reply to comments on TikTok.
          </PermRow>
        </div>
      </Subsection>

      <Subsection title="Reconnecting an expired account">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Social platform access tokens expire periodically (typically every 60–90 days for
          most platforms). When a token expires, the account shows a
          <StatusBadge color="text-status-warning border-status-warning/30">Token expired</StatusBadge>
          badge in Settings and in the workspace overview.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          To reconnect, click <Strong>Reconnect</Strong> next to the expired account and go through
          the OAuth flow again. You do not need to reselect the page — LYRA will update the token
          for the same account automatically.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Posts scheduled during the expiry window will not have published. Check the content
          calendar for any posts with a <StatusBadge color="text-status-error border-status-error/30">Failed</StatusBadge> status
          and reschedule or republish them manually after reconnecting.
        </p>
      </Subsection>

      <Subsection title="Disconnecting an account">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          In <Strong>Settings → Social Accounts</Strong>, click the three-dot menu next to any
          connected account and select <Strong>Disconnect</Strong>. This immediately revokes
          LYRA&apos;s stored access token for that platform. LYRA will no longer be able to
          publish posts, read comments, or take any action on that account.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Disconnecting does not revoke the token at the platform level — it only removes it from
          LYRA. To fully revoke LYRA&apos;s access, also remove the app from your connected apps
          settings on the platform itself (e.g. Facebook Settings → Business Integrations).
        </p>
        <Note>
          Any scheduled posts targeting a disconnected account will move to
          <StatusBadge color="text-status-error border-status-error/30">Failed</StatusBadge> status
          at their scheduled publish time. They are not deleted — you can reconnect the account
          and reschedule them.
        </Note>
      </Subsection>

      <Subsection title="Client onboarding links">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          On Pro and Agency plans, you can let clients connect their own social accounts without
          sharing credentials with you. This is the recommended approach for agencies managing
          accounts on behalf of clients.
        </p>
        <Steps>
          <Step n={1}>
            Go to <Strong>Settings → Client Access</Strong> within the workspace.
          </Step>
          <Step n={2}>
            Click <Strong>Generate onboarding link</Strong>. A unique, time-limited URL is created.
          </Step>
          <Step n={3}>
            Send the link to your client by email, Slack, or any messaging tool.
          </Step>
          <Step n={4}>
            The client clicks the link and is taken to a guided LYRA onboarding screen.
            They connect each social account directly — their login credentials go only to the
            platform, never to LYRA or to you.
          </Step>
          <Step n={5}>
            Once they complete the flow, the connected accounts appear in the workspace
            immediately. You receive an email notification.
          </Step>
        </Steps>
        <Note>
          Onboarding links expire after 7 days. If your client does not complete the flow in time,
          generate a new link from the same settings page.
        </Note>
      </Subsection>
    </section>
  )
}
