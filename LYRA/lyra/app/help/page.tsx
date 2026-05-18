export const metadata = {
  title: 'Documentation — LYRA',
  description: 'Complete guide to using the LYRA platform.',
}

export default function HelpPage() {
  return (
    <div className="space-y-20">

      {/* ─────────────────────────────────────────────────────── */}
      {/* 01 · Getting Started                                    */}
      {/* ─────────────────────────────────────────────────────── */}
      <section id="getting-started" className="space-y-8 scroll-mt-28">
        <SectionHeader n="01" title="Getting Started" />

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA is a social media intelligence platform built for agencies, freelancers, and growing
          businesses. It centralises every aspect of social media management — scheduling content,
          generating AI-powered captions calibrated to each client&apos;s brand voice, responding to
          comments and reviews automatically, and tracking performance — all from a single interface.
        </p>

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The platform is structured around <Strong>workspaces</Strong>. Each workspace represents
          one client or brand, with its own social accounts, brand intelligence profile, content
          calendar, inbox, SEO data, and analytics. Switching between clients takes one click.
        </p>

        <Subsection title="Creating your account">
          <Steps>
            <Step n={1}>
              Visit <Strong>lyraonline.ai</Strong> and click <Strong>Get started free</Strong>.
            </Step>
            <Step n={2}>
              Sign in with your Google account, or enter your email address and create a password.
              If using email, check your inbox for a verification link before continuing.
            </Step>
            <Step n={3}>
              Enter your name and the name of your agency or business. This appears in the account
              settings and on any client-facing communications LYRA sends.
            </Step>
            <Step n={4}>
              Select the plan that fits your needs. You can change or upgrade at any time.
              A 14-day free trial is available on Pro and Agency plans — no credit card required
              to start.
            </Step>
            <Step n={5}>
              You are taken to the LYRA dashboard. A guided setup prompt will walk you through
              creating your first workspace if you haven&apos;t already.
            </Step>
          </Steps>
          <Note>
            If you signed up with Google and your name or avatar does not appear correctly, you can
            update it at any time under <Strong>Account → Profile</Strong>.
          </Note>
        </Subsection>

        <Subsection title="The dashboard">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The dashboard is your overview screen. It does not belong to any single workspace —
            it shows a summary across all of them. From here you can see:
          </p>
          <ul className="space-y-2 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>Posts scheduled for the next 7 days across all workspaces</li>
            <li>Unread comments and pending approvals waiting in the inbox</li>
            <li>Brand intelligence build status for each workspace</li>
            <li>A quick-access link to the most recently active workspace</li>
            <li>Any billing or account notices (e.g. a failed payment, approaching workspace limit)</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            To dive into a specific client, click their workspace from the workspace switcher in
            the top of the sidebar — every part of the app immediately switches context to that client.
          </p>
        </Subsection>

        <Subsection title="Navigating the app">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The left sidebar is the primary navigation. It is always visible on desktop and
            collapses to icon-only on smaller screens.
          </p>
          <ul className="space-y-2 font-sans text-sm text-text-secondary">
            <li>
              <Strong>Workspace switcher (top of sidebar)</Strong> — shows your current workspace.
              Click to open a list of all workspaces and switch between them, or create a new one.
            </li>
            <li>
              <Strong>Calendar</Strong> — the monthly content calendar for the active workspace.
            </li>
            <li>
              <Strong>Compose</Strong> — open the post composer to draft, generate, and schedule content.
            </li>
            <li>
              <Strong>Inbox</Strong> — all comments, replies, and reviews from connected social platforms.
            </li>
            <li>
              <Strong>Brand Intelligence</Strong> — the AI brand profile for the active workspace.
            </li>
            <li>
              <Strong>SEO</Strong> — Google Search Console performance data for the active workspace.
            </li>
            <li>
              <Strong>Analytics</Strong> — social media performance data for the active workspace.
            </li>
            <li>
              <Strong>Settings</Strong> — workspace-level configuration including connected accounts,
              AI autonomy, guardrails, and client access.
            </li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            At the top right of every page you will find the search icon, the <Strong>Upgrade</Strong>
            button (if your current plan has room to grow), and your account avatar. Clicking the
            avatar opens account settings, billing, and the sign-out option.
          </p>
        </Subsection>

        <Subsection title="Recommended setup order">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            For the best experience, complete these steps for each new client workspace:
          </p>
          <Steps>
            <Step n={1}>Create the workspace with the client&apos;s name, website URL, and industry.</Step>
            <Step n={2}>Connect all relevant social media accounts in <Strong>Settings → Social Accounts</Strong>.</Step>
            <Step n={3}>Build the brand intelligence profile in <Strong>Brand Intelligence</Strong>.</Step>
            <Step n={4}>Connect Google Search Console in <Strong>SEO</Strong> if you manage their website SEO.</Step>
            <Step n={5}>Schedule the first batch of posts using the composer and calendar.</Step>
            <Step n={6}>Configure the inbox autonomy setting to match your workflow.</Step>
          </Steps>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Steps 1–3 must be complete before AI caption generation or AI comment responses will
            work for that workspace. Everything else is independent and can be configured at any time.
          </p>
        </Subsection>
      </section>

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 02 · Workspaces                                         */}
      {/* ─────────────────────────────────────────────────────── */}
      <section id="workspaces" className="space-y-8 scroll-mt-28">
        <SectionHeader n="02" title="Workspaces" />

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          A workspace is a self-contained environment for a single client or brand. Every piece of
          data in LYRA — social accounts, posts, comments, brand profiles, analytics, and SEO data —
          belongs to exactly one workspace. Your subscription plan determines how many workspaces
          you can create.
        </p>

        <InfoBox>
          <Strong>Starter</Strong> — 1 workspace &nbsp;·&nbsp;
          <Strong>Pro</Strong> — up to 5 workspaces &nbsp;·&nbsp;
          <Strong>Agency</Strong> — unlimited workspaces
        </InfoBox>

        <Subsection title="Creating a workspace">
          <Steps>
            <Step n={1}>
              Click the workspace name at the top of the sidebar to open the workspace switcher panel.
            </Step>
            <Step n={2}>
              Click <Strong>New workspace</Strong> at the bottom of the panel.
            </Step>
            <Step n={3}>
              Enter the <Strong>Workspace name</Strong>. This is typically the client&apos;s brand name
              (e.g. &ldquo;Harbour Dental&rdquo; or &ldquo;Coastal Running Co.&rdquo;). It is visible only to you and
              your team — not to the client.
            </Step>
            <Step n={4}>
              Enter the <Strong>Website URL</Strong>. This is used by the Brand Intelligence engine
              to crawl the site and build the AI brand profile. Include the full URL including
              <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md ml-1">https://</code>.
            </Step>
            <Step n={5}>
              Select the <Strong>Industry</Strong> that best matches the client. This helps the AI
              contextualise tone of voice and content suggestions appropriately.
            </Step>
            <Step n={6}>
              Click <Strong>Create workspace</Strong>. You are taken to the new workspace overview,
              which will prompt you to connect social accounts and build the brand profile.
            </Step>
          </Steps>
          <Note>
            If you are on a Starter plan and already have 1 workspace, the New workspace option
            will be disabled and replaced with an upgrade prompt. Upgrade to Pro or Agency to
            add more workspaces.
          </Note>
        </Subsection>

        <Subsection title="Switching between workspaces">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Click the workspace name at the top of the sidebar at any time to open the switcher.
            Your workspaces are listed alphabetically. Click any workspace to switch to it instantly.
            The entire app — calendar, inbox, brand, SEO, analytics, and settings — switches to
            show data for the selected workspace. The URL updates to reflect the active workspace ID.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            You can also bookmark direct deep links. For example, if a client&apos;s workspace ID is
            <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">ws_abc123</code>,
            you can bookmark
            <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md ml-1">lyraonline.ai/workspace/ws_abc123/calendar</code>
            &nbsp;to jump directly to their calendar.
          </p>
        </Subsection>

        <Subsection title="Editing workspace details">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Go to <Strong>Settings → General</Strong> within the active workspace to update:
          </p>
          <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>Workspace name</li>
            <li>Website URL (triggers a brand profile refresh prompt)</li>
            <li>Industry</li>
            <li>Client timezone (used for post scheduling and analytics)</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            If you change the website URL, LYRA will prompt you to rebuild the brand intelligence
            profile using the new URL. Existing AI-generated captions and responses are not
            affected until you rebuild.
          </p>
        </Subsection>

        <Subsection title="Workspace overview page">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Clicking a workspace in the switcher takes you to the workspace overview page. This page
            shows the connection status of all social accounts, the brand intelligence build status,
            a count of posts scheduled for the next 7 days, and any action items requiring attention
            (e.g. an expired social token, an unapproved comment waiting since yesterday).
          </p>
        </Subsection>

        <Subsection title="Deleting a workspace">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            In <Strong>Settings → General</Strong>, scroll to the <Strong>Danger Zone</Strong> at
            the bottom and click <Strong>Delete workspace</Strong>. You will be asked to type the
            workspace name to confirm. This permanently and irreversibly deletes:
          </p>
          <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>All posts (drafts, scheduled, and published records)</li>
            <li>All comments and comment responses</li>
            <li>The brand intelligence profile</li>
            <li>All analytics data</li>
            <li>All connected social account tokens</li>
            <li>All SEO connection data</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Deleting a workspace does not affect your subscription. You can create a new workspace
            in the same slot immediately after deleting.
          </p>
        </Subsection>
      </section>

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 03 · Social Connections                                 */}
      {/* ─────────────────────────────────────────────────────── */}
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

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 04 · Brand Intelligence                                 */}
      {/* ─────────────────────────────────────────────────────── */}
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

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 05 · Content Calendar                                   */}
      {/* ─────────────────────────────────────────────────────── */}
      <section id="content-calendar" className="space-y-8 scroll-mt-28">
        <SectionHeader n="05" title="Content Calendar" />

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The content calendar gives you a visual overview of all scheduled and published posts
          for the active workspace. It is a planning and review tool — from here you can see what
          is going out, when, and on which platforms. You can reschedule posts by dragging them
          between days, preview any post before it goes out, or jump straight into the composer
          to write new content.
        </p>

        <Subsection title="Reading the calendar">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The calendar shows one full month at a time. Each day cell may contain zero or more
            post chips. Each chip shows:
          </p>
          <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>A small platform icon (Facebook, Instagram, etc.)</li>
            <li>The first 30–40 characters of the caption</li>
            <li>A coloured left border indicating the post&apos;s status</li>
            <li>The scheduled time in the client&apos;s timezone</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            If a day has more posts than can fit in the cell, a
            <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">+N more</code>
            label appears. Click it to expand the day and see all posts.
          </p>
        </Subsection>

        <Subsection title="Post status indicators">
          <div className="space-y-2">
            <StatusRow status="Draft" color="text-text-tertiary border-background-border-mid">
              The post has been saved but is not yet scheduled. It will not be published automatically.
              Draft posts appear in the calendar on the date they were last saved, or the target date
              if you set one.
            </StatusRow>
            <StatusRow status="Pending Approval" color="text-status-warning border-status-warning/30">
              The post has been submitted for client approval and is waiting for a decision.
              It cannot be scheduled until approved. On Pro and Agency plans, clients can approve
              or reject posts through their dedicated approval link.
            </StatusRow>
            <StatusRow status="Scheduled" color="text-status-info border-status-info/30">
              The post is approved and queued for automatic publishing at the scheduled time.
              LYRA&apos;s background publishing worker will process it at the exact time shown.
            </StatusRow>
            <StatusRow status="Published" color="text-status-success border-status-success/30">
              The post was successfully published to the platform. Click it to see the publish
              timestamp and a link to the live post.
            </StatusRow>
            <StatusRow status="Failed" color="text-status-error border-status-error/30">
              An error occurred during publishing. The most common causes are: expired social
              account token, the post was deleted from the queue, or the platform API returned
              an error. Click the post to see the specific error message and a Retry option.
            </StatusRow>
            <StatusRow status="Cancelled" color="text-text-tertiary border-background-border-mid">
              The post was manually cancelled before its scheduled publish time, or was cancelled
              automatically when the target social account was disconnected.
            </StatusRow>
          </div>
        </Subsection>

        <Subsection title="Navigating between months">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Click the left and right arrows flanking the month name to move backwards and forwards
            through the calendar. Click <Strong>Today</Strong> to jump back to the current month
            with today&apos;s date highlighted. You can navigate freely through past months to review
            historical post activity.
          </p>
        </Subsection>

        <Subsection title="Rescheduling posts by dragging">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Any post in <Strong>Draft</Strong>, <Strong>Pending Approval</Strong>, or
            <Strong> Scheduled</Strong> status can be rescheduled by dragging it from one day cell
            to another. The post time (hour and minute) is preserved — only the date changes.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            To change the time as well, click the post chip to open it in the composer, update
            the date/time picker, and save.
          </p>
          <Note>
            Published and Failed posts cannot be dragged. If a failed post needs to be republished,
            click it, select <Strong>Edit &amp; Reschedule</Strong>, set a new time, and click
            <Strong> Schedule</Strong>.
          </Note>
        </Subsection>

        <Subsection title="Previewing a post">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Click any post chip on the calendar to open a preview panel on the right side of
            the screen. The preview shows the full caption, all attached media, the target
            platform(s), the scheduled time, and the current status. From the preview panel
            you can:
          </p>
          <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>Click <Strong>Edit</Strong> to open the post in the full composer</li>
            <li>Click <Strong>Duplicate</Strong> to create a copy (useful for cross-posting)</li>
            <li>Click <Strong>Cancel post</Strong> to cancel a scheduled post before it publishes</li>
            <li>Click <Strong>View on platform</Strong> (published posts only) to open the live post</li>
          </ul>
        </Subsection>

        <Subsection title="Creating a post from the calendar">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Click any empty day cell to show a <Strong>+ New post</Strong> button for that date.
            Clicking it opens the composer with the date pre-filled. Alternatively, click the
            global <Strong>Compose</Strong> link in the sidebar at any time to open the composer
            without a pre-set date.
          </p>
        </Subsection>

        <Subsection title="Filtering the calendar">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Use the platform filter buttons above the calendar grid to show only posts for
            specific platforms. For example, click the Instagram filter to hide all non-Instagram
            posts and focus your review on Instagram content. Click it again to show all platforms.
            Multiple platform filters can be active simultaneously.
          </p>
        </Subsection>
      </section>

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 06 · Compose                                            */}
      {/* ─────────────────────────────────────────────────────── */}
      <section id="compose" className="space-y-8 scroll-mt-28">
        <SectionHeader n="06" title="Compose" />

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The composer is where you create, edit, and schedule posts. It is designed for speed —
          write once and post across all your connected platforms simultaneously, or customise
          each platform&apos;s caption independently. The AI suggestion panel is always available
          on the right to generate caption ideas, rewrite drafts, or suggest hashtags.
        </p>

        <Subsection title="Selecting platforms">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            At the top of the composer, the <Strong>Platform selector</Strong> shows all social
            accounts connected to the active workspace. Click any platform icon to toggle it on
            or off for this post. You can post to one platform or all of them at once.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            When multiple platforms are selected, the composer uses the same caption for all of
            them by default. To write a custom caption for a specific platform, click the
            platform tab that appears below the editor and edit independently. A lock icon
            indicates the caption is shared; an unlock icon means it has been customised.
          </p>
        </Subsection>

        <Subsection title="Writing your caption">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The editor is a rich text area that supports:
          </p>
          <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>Bold and italic formatting (where the target platform supports it)</li>
            <li>Line breaks and paragraph spacing</li>
            <li>Hashtag and @mention highlighting</li>
            <li>Emoji insertion via the emoji picker</li>
            <li>Link insertion — LYRA will show a preview of the linked URL</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            A live character counter appears at the bottom right of the editor, showing the
            character count for the currently active platform tab. Text that exceeds the
            platform limit turns red.
          </p>
        </Subsection>

        <Subsection title="Platform character limits">
          <div className="rounded-xl border border-background-border overflow-hidden">
            <table className="w-full font-sans text-sm">
              <thead>
                <tr className="border-b border-background-border bg-background-secondary">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-[0.08em]">Platform</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary uppercase tracking-[0.08em]">Limit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-[0.08em]">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-border">
                {[
                  ['X (Twitter)', '280', 'Each tweet. Threads allow sequential tweets.'],
                  ['LinkedIn', '3,000', 'Company page posts. Articles have no limit.'],
                  ['Facebook', '63,206', 'In practice, 80–250 chars performs best.'],
                  ['Instagram', '2,200', 'First 3 lines visible before "more" truncation.'],
                  ['TikTok', '2,200', 'Video caption only.'],
                  ['Google Business', '1,500', 'Google Posts (offers, updates, events).'],
                ].map(([platform, limit, note]) => (
                  <tr key={platform}>
                    <td className="px-4 py-3 text-text-secondary">{platform}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-accent-silver">{limit}</td>
                    <td className="px-4 py-3 text-text-tertiary text-xs">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Subsection>

        <Subsection title="Adding media">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Click <Strong>Add media</Strong> (or drag and drop files onto the composer) to attach
            images or video. Accepted formats and limits by platform:
          </p>
          <ul className="space-y-1.5 font-sans text-sm text-text-secondary">
            <li><Strong>Images:</Strong> JPG, PNG, GIF, WEBP — up to 20 MB per image, up to 10 images per post</li>
            <li><Strong>Video:</Strong> MP4, MOV, AVI — up to 512 MB, length limits vary by platform</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            After uploading, LYRA checks the media against platform-specific requirements and flags
            any issues (e.g. &ldquo;Instagram requires a minimum width of 320px&rdquo;). Click the warning to
            see what needs to change.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            For Instagram carousel posts, drag the uploaded images to reorder them before scheduling.
            The first image is the cover shown in the feed.
          </p>
        </Subsection>

        <Subsection title="AI caption generation">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The AI suggestion panel on the right side of the composer is always available when
            Brand Intelligence has been built for the workspace.
          </p>
          <Steps>
            <Step n={1}>
              Click <Strong>Generate with AI</Strong> in the suggestion panel. Optionally, type a
              brief prompt — a topic, an angle, a specific campaign message, or a description of
              any attached media. The more context you provide, the more targeted the output.
              Example prompts:
              <ul className="mt-1.5 ml-4 space-y-1 font-sans text-xs text-text-tertiary list-disc">
                <li>&ldquo;Our new winter menu launches Friday — build excitement&rdquo;</li>
                <li>&ldquo;This is a before/after renovation photo — keep it professional&rdquo;</li>
                <li>&ldquo;Motivational Monday post for our gym audience&rdquo;</li>
              </ul>
            </Step>
            <Step n={2}>
              The AI generates 3 caption variations, each calibrated to the brand voice profile.
              Each variation is shown with a character count for the active platform.
            </Step>
            <Step n={3}>
              Click <Strong>Use this</Strong> under any variation to insert it into the editor.
              The existing draft is replaced.
            </Step>
            <Step n={4}>
              Click <Strong>Regenerate</Strong> to get a fresh set of 3 variations with different
              angles, or click <Strong>Refine</Strong> to adjust the current output (e.g.
              &ldquo;Make it shorter&rdquo;, &ldquo;Add a call to action&rdquo;, &ldquo;More formal tone&rdquo;).
            </Step>
            <Step n={5}>
              Always review and edit the AI output before scheduling. The AI writes in the brand&apos;s
              voice, but you know the client best — adjust anything that doesn&apos;t feel right.
            </Step>
          </Steps>
          <Note>
            AI generation counts against your plan&apos;s AI credit allowance. Pro and Agency plans
            include generous monthly limits. Starter plans have limited AI generation — upgrade
            to unlock full access.
          </Note>
        </Subsection>

        <Subsection title="Hashtag suggestions">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            After generating or writing a caption, click <Strong>Suggest hashtags</Strong> in the
            suggestion panel. LYRA recommends a mix of high-volume and niche hashtags relevant to
            the caption content and the client&apos;s industry. Click any hashtag to add it to the
            caption, or click <Strong>Add all</Strong> to append the full set.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Hashtag suggestions are only shown for platforms where hashtags are effective —
            Instagram, X, LinkedIn, and TikTok. They are suppressed for Facebook and Google
            Business by default.
          </p>
        </Subsection>

        <Subsection title="Scheduling a post">
          <Steps>
            <Step n={1}>
              Click the <Strong>Schedule</Strong> button at the bottom right of the composer.
            </Step>
            <Step n={2}>
              The date and time picker opens. Select the date and set the exact time in the
              client&apos;s timezone (displayed in the picker).
            </Step>
            <Step n={3}>
              Optionally, click <Strong>Best time to post</Strong>. LYRA suggests an optimal
              time based on the historical engagement patterns for this workspace&apos;s connected accounts.
            </Step>
            <Step n={4}>
              Click <Strong>Schedule</Strong>. The post is added to the calendar and queued
              for automatic publishing. You will see a confirmation and a link back to the calendar.
            </Step>
          </Steps>
          <Note>
            Posts can be scheduled up to 6 months in advance. The minimum scheduling lead time
            is 5 minutes from now. Posts cannot be backdated.
          </Note>
        </Subsection>

        <Subsection title="Saving as draft">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Click <Strong>Save draft</Strong> instead of Schedule to save the post without queuing it.
            Drafts appear on the calendar on the date you set, but with a grey Draft status.
            They will not be published automatically — you must return and schedule them manually.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Unsaved changes are auto-saved every 30 seconds while the composer is open.
            If you close the composer without saving, a browser confirmation prompt appears.
          </p>
        </Subsection>

        <Subsection title="Sending for client approval">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            On Pro and Agency plans, if the workspace has client approval enabled, you will see a
            <Strong> Send for approval</Strong> option instead of (or alongside) Schedule.
            Clicking it saves the post with a <StatusBadge color="text-status-warning border-status-warning/30">Pending Approval</StatusBadge> status
            and sends the client a notification email with a link to review the post. The post
            is not scheduled until they approve it.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            You can set a deadline for approval. If the client has not responded by the deadline,
            LYRA sends them a reminder and notifies you.
          </p>
        </Subsection>
      </section>

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 07 · Inbox                                              */}
      {/* ─────────────────────────────────────────────────────── */}
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

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 08 · SEO                                                */}
      {/* ─────────────────────────────────────────────────────── */}
      <section id="seo" className="space-y-8 scroll-mt-28">
        <SectionHeader n="08" title="SEO" />

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The SEO module brings Google Search Console data directly into LYRA, so you can track
          your client&apos;s organic search performance alongside their social media performance —
          without switching to another tool. You see the queries driving traffic, the pages
          ranking, click-through rates, and position trends, all filtered to the reporting period
          you choose.
        </p>

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA requests <Strong>read-only access</Strong> to Search Console. It cannot modify
          settings, remove URLs from indexing, or make any changes to the connected GSC property.
        </p>

        <Subsection title="Prerequisites">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Before connecting, ensure the following:
          </p>
          <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>
              The client&apos;s website is verified in <Strong>Google Search Console</Strong> at
              <a href="https://search.google.com/search-console" className="font-mono text-xs text-accent-silver ml-1 hover:text-text-primary transition-colors">search.google.com/search-console</a>.
            </li>
            <li>
              The Google account you will use to connect has <Strong>Full</Strong> or
              <Strong> Owner</Strong> access to the Search Console property (not Restricted).
            </li>
            <li>
              There is at least 28 days of data in the property. Properties with fewer than
              28 days of data will still connect but some charts will show incomplete data.
            </li>
          </ul>
        </Subsection>

        <Subsection title="Connecting Google Search Console">
          <Steps>
            <Step n={1}>
              Open the workspace and click <Strong>SEO</Strong> in the sidebar. If no GSC
              connection exists, you see the connection screen.
            </Step>
            <Step n={2}>
              Click <Strong>Connect Google Search Console</Strong>.
            </Step>
            <Step n={3}>
              A Google sign-in popup opens. Select the Google account that has access to the
              client&apos;s Search Console property. If the client owns their own GSC, you may need
              to ask them to log in — use the client onboarding link feature for this.
            </Step>
            <Step n={4}>
              Google will ask you to grant LYRA permission to view Search Console performance
              data. Click <Strong>Allow</Strong>.
            </Step>
            <Step n={5}>
              LYRA fetches the list of properties available on that Google account. A property
              picker appears — select the correct website property. If the site is verified as
              both a domain property (e.g.
              <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">example.com</code>) and
              a URL-prefix property (e.g.
              <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">https://www.example.com</code>),
              select the domain property for the most complete data.
            </Step>
            <Step n={6}>
              Click <Strong>Connect this property</Strong>. LYRA saves the connection and loads
              the SEO dashboard with the last 28 days of data.
            </Step>
          </Steps>
          <Note>
            GSC data has a 2–3 day lag built into the Google API. Data for today and the past
            48 hours may not yet appear in the charts. This is a Google limitation and cannot
            be changed.
          </Note>
        </Subsection>

        <Subsection title="Reading the SEO dashboard">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The SEO dashboard is structured into four metric cards at the top and two tables below.
          </p>
          <div className="space-y-3 mt-3">
            <MetricRow metric="Clicks">
              The total number of times a user clicked a result from this site in Google Search.
              A direct measure of organic traffic driven by search.
            </MetricRow>
            <MetricRow metric="Impressions">
              How many times any URL from the site appeared in search results, whether or not
              the user scrolled to see it. Impressions at low positions (e.g. page 3) may not
              have been genuinely visible but are still counted.
            </MetricRow>
            <MetricRow metric="Average CTR">
              Click-through rate: clicks divided by impressions, expressed as a percentage.
              Industry average CTR varies significantly by position — position 1 typically
              achieves 20–35%, position 10 typically 2–5%.
            </MetricRow>
            <MetricRow metric="Average Position">
              The mean ranking position across all queries that generated at least one impression.
              Lower is better — position 1 is the top result. This figure can be misleading in
              isolation because a single query ranking at position 1 with 10,000 impressions
              can skew the average significantly. Use the Top Queries table for richer detail.
            </MetricRow>
          </div>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
            The <Strong>Top Queries</Strong> table lists the search terms bringing the most traffic,
            with clicks, impressions, CTR, and average position for each. Click any column header
            to sort by that metric. Sorting by <Strong>Impressions</Strong> descending is useful
            for finding high-visibility queries with low CTR — these are opportunities to improve
            title tags and meta descriptions.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            The <Strong>Top Pages</Strong> table shows the same metrics broken down by URL rather
            than query. This helps identify which pages are performing strongest organically and
            which may need content improvements.
          </p>
        </Subsection>

        <Subsection title="Changing the date range">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Use the date range picker at the top right of the SEO dashboard to change the
            reporting period. Available options:
          </p>
          <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>Last 7 days</li>
            <li>Last 28 days (default)</li>
            <li>Last 3 months</li>
            <li>Last 6 months</li>
            <li>Last 12 months</li>
            <li>Last 16 months (maximum supported by the GSC API)</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            All four metric cards and both tables update to reflect the selected range.
          </p>
        </Subsection>

        <Subsection title="Disconnecting Search Console">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Go to <Strong>Settings → Integrations</Strong> and click <Strong>Disconnect</Strong>
            next to Google Search Console. This removes the OAuth token from LYRA. The SEO
            dashboard will show the connection prompt again. No historical query data is stored
            by LYRA — all data is fetched live from the GSC API on each page load, so there is
            nothing to delete.
          </p>
        </Subsection>
      </section>

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 09 · Analytics                                          */}
      {/* ─────────────────────────────────────────────────────── */}
      <section id="analytics" className="space-y-8 scroll-mt-28">
        <SectionHeader n="09" title="Analytics" />

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The analytics dashboard aggregates performance data from all connected social platforms
          for the active workspace into a single view. Instead of logging in to Facebook Insights,
          then switching to LinkedIn Analytics, then checking Instagram — LYRA consolidates
          everything and presents it in a consistent format.
        </p>

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Analytics data is synced hourly from each connected platform. The dashboard
          reflects data as of the last successful sync, shown in the top right of the page.
        </p>

        <Subsection title="Overview metrics">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The overview row shows aggregate totals across all connected platforms for the
            selected date range:
          </p>
          <div className="space-y-3 mt-3">
            <MetricRow metric="Reach">
              The total number of unique accounts that saw any content from this workspace in
              the period. This is a deduplicated count per platform — the same person seeing
              content on both Facebook and Instagram counts as two reach instances.
            </MetricRow>
            <MetricRow metric="Impressions">
              Total number of times any piece of content was displayed, including repeat views
              by the same account. Impressions are always equal to or greater than reach.
            </MetricRow>
            <MetricRow metric="Engagements">
              Sum of all meaningful interactions across all platforms: likes, reactions,
              comments, shares, saves, reposts, retweets, and link clicks. Impressions (passive
              views) are not counted as engagements.
            </MetricRow>
            <MetricRow metric="Engagement Rate">
              Engagements divided by reach, expressed as a percentage. The most platform-neutral
              way to compare performance across different audience sizes. Industry benchmarks
              typically range from 1–3% on Facebook, 3–6% on Instagram, and 1–2% on LinkedIn.
            </MetricRow>
            <MetricRow metric="Net New Followers">
              Followers gained minus followers lost in the selected period, per platform.
              A positive number indicates audience growth.
            </MetricRow>
            <MetricRow metric="Posts Published">
              Count of posts that were published via LYRA in the selected period, across all
              connected platforms.
            </MetricRow>
          </div>
        </Subsection>

        <Subsection title="Platform breakdown">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Below the overview metrics, each connected platform has its own card showing the
            same set of metrics for that platform only. This lets you immediately see which
            platforms are driving the most engagement and identify any underperforming channels
            that may need a strategy change.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Click any platform card to drill into a full platform-level view with trend charts
            showing daily or weekly metric movement over the selected period.
          </p>
        </Subsection>

        <Subsection title="Engagement chart">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The engagement chart in the middle of the dashboard shows daily engagement over the
            selected period, with each platform rendered as a distinct coloured line. Hover over
            any data point to see the exact figure for that day.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Click any platform name in the chart legend to toggle its line on or off. This is
            useful when one platform&apos;s numbers dwarf the others and you want to zoom in on
            smaller-scale trends.
          </p>
        </Subsection>

        <Subsection title="Top posts">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            The Top Posts table at the bottom of the analytics page lists the highest-performing
            posts from the period, ranked by total engagements by default. Each row shows:
          </p>
          <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>Platform icon and post type (feed, reel, story, etc.)</li>
            <li>Caption snippet and thumbnail if available</li>
            <li>Publish date and time</li>
            <li>Reach, impressions, engagements, and engagement rate for that post</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Click any post row to open a full post analytics panel with a complete breakdown of
            all available metrics for that post, including reactions by type (Facebook), saves
            (Instagram), and profile visits generated.
          </p>
        </Subsection>

        <Subsection title="Changing the date range">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Use the date range picker at the top right of the analytics page. Options:
          </p>
          <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>Last 7 days</li>
            <li>Last 28 days (default)</li>
            <li>Last 3 months</li>
            <li>Last 6 months</li>
            <li>Last 12 months</li>
            <li>Custom range</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            When you change the range, all cards, charts, and tables update simultaneously.
            The comparison badge on each metric card shows the percentage change versus the
            equivalent prior period (e.g. changing the last 28 days compares it to the 28 days
            before that).
          </p>
        </Subsection>

        <Subsection title="Data availability">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            LYRA can only show analytics for posts published while the social account was connected.
            If an account was connected last month, you will see data from last month onwards.
            Historical data prior to the connection date is not available.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Platform APIs have varying data retention windows. Facebook and Instagram provide
            up to 2 years of post-level metrics. LinkedIn provides 12 months. X (Twitter)
            provides 30 days via the standard API.
          </p>
        </Subsection>
      </section>

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 10 · Settings                                           */}
      {/* ─────────────────────────────────────────────────────── */}
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
            Configure which events trigger email notifications. Defaults:
          </p>
          <ul className="space-y-1.5 font-sans text-sm text-text-secondary">
            <li><Strong>Escalated comment</Strong> — on by default. Immediate notification.</li>
            <li><Strong>Post failed to publish</Strong> — on by default. Sent within 5 minutes of failure.</li>
            <li><Strong>Token expired</Strong> — on by default. Sent when a social token expires.</li>
            <li><Strong>Pending approval (yours)</Strong> — off by default. Daily digest of posts awaiting your approval.</li>
            <li><Strong>Client approved or rejected a post</Strong> — on by default.</li>
            <li><Strong>Billing events</Strong> — on by default. Invoices, failed payments, renewal reminders.</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            All notification emails come from <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md">notifications@lyraonline.ai</code>.
            Add this to your safe sender list to avoid them landing in spam.
          </p>
        </Subsection>

        <Subsection title="Account settings — Team (Agency plan)">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Invite team members to your LYRA account so they can manage workspaces alongside you.
            Click <Strong>Invite team member</Strong>, enter their email, and select a role:
          </p>
          <ul className="space-y-2 font-sans text-sm text-text-secondary">
            <li>
              <Strong>Admin</Strong> — full access to all workspaces and account settings,
              including billing. Can invite and remove other team members.
            </li>
            <li>
              <Strong>Manager</Strong> — full access to all workspaces (create, edit, delete posts,
              manage inbox, view analytics). Cannot access billing or invite team members.
            </li>
            <li>
              <Strong>Editor</Strong> — can create and edit posts and manage the inbox across all
              workspaces. Cannot change workspace settings, connect social accounts, or delete posts.
            </li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Invited team members receive an email with a link to create their LYRA account.
            The invitation link expires after 7 days. You can revoke an invitation at any time
            from the Team settings page.
          </p>
        </Subsection>
      </section>

      <Divider />

      {/* ─────────────────────────────────────────────────────── */}
      {/* 11 · Billing                                            */}
      {/* ─────────────────────────────────────────────────────── */}
      <section id="billing" className="space-y-8 scroll-mt-28">
        <SectionHeader n="11" title="Billing" />

        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA subscriptions are billed monthly (or annually at a discount) and processed
          securely through <Strong>Stripe</Strong>. LYRA never stores your payment card details —
          they are handled entirely by Stripe&apos;s PCI-compliant infrastructure. You can view and
          manage all billing details from <Strong>Account → Billing</Strong>.
        </p>

        <Subsection title="Plans">
          <div className="space-y-4">
            <PlanCard
              name="Starter"
              price="$49 / month"
              description="For solo operators and small businesses managing their own presence."
              features={[
                '1 workspace',
                'Post scheduling across 6 social platforms',
                'Content calendar with drag-to-reschedule',
                'Basic brand intelligence profile',
                'Manual inbox management (no AI responses)',
                'Social media analytics',
                'Google Search Console SEO integration',
              ]}
            />
            <PlanCard
              name="Pro"
              price="$149 / month"
              description="For freelancers and small agencies managing multiple clients."
              features={[
                'Up to 5 workspaces',
                'Everything in Starter',
                'Full brand intelligence (social feed analysis + document upload)',
                'AI caption generation',
                'AI comment response drafts (Draft + Approve mode)',
                'Client onboarding links for self-service account connection',
                'Client approval workflows',
              ]}
            />
            <PlanCard
              name="Agency"
              price="$399 / month"
              description="For agencies running social media at scale across many clients."
              features={[
                'Unlimited workspaces',
                'Everything in Pro',
                'Full AI autonomy (AI responds to comments automatically)',
                'Guardrail controls (Never discuss, Never use word, Always escalate, Approved answers)',
                'Team members with role-based access (Admin, Manager, Editor)',
                'Priority support',
              ]}
            />
          </div>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
            All prices are in USD and exclusive of any applicable taxes. Annual billing is
            available at a significant discount — contact{' '}
            <a href="mailto:billing@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
              billing@lyraonline.ai
            </a>{' '}
            for annual pricing.
          </p>
        </Subsection>

        <Subsection title="Upgrading your plan">
          <Steps>
            <Step n={1}>
              Click the <Strong>Upgrade</Strong> button in the top navigation bar (visible to
              Starter and Pro subscribers), or go to <Strong>Account → Billing</Strong> and click
              <Strong> Change plan</Strong>.
            </Step>
            <Step n={2}>
              The upgrade panel shows the next available plan with a full list of what you gain.
              Review the features and price.
            </Step>
            <Step n={3}>
              Click <Strong>Upgrade to {'{plan}'}</Strong>. You are redirected to a Stripe-hosted
              checkout page.
            </Step>
            <Step n={4}>
              Enter your payment details (card number, expiry, CVC, and billing address).
              Stripe handles all payment security — LYRA never sees your card number.
            </Step>
            <Step n={5}>
              Click <Strong>Subscribe</Strong>. The payment is processed immediately and you are
              redirected back to LYRA. The new plan features are active within 30 seconds.
            </Step>
          </Steps>
          <Note>
            When upgrading mid-cycle, Stripe calculates a pro-rated charge for the remainder of
            the current billing period. Your next regular charge will be the full new plan price
            on your regular billing date.
          </Note>
        </Subsection>

        <Subsection title="Managing your subscription">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Go to <Strong>Account → Billing</Strong> and click <Strong>Manage subscription</Strong>.
            This opens the <Strong>Stripe Billing Portal</Strong> — a Stripe-hosted page where you can:
          </p>
          <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
            <li>View your current plan and next renewal date</li>
            <li>Update your payment method (card or bank account)</li>
            <li>Update your billing address</li>
            <li>Download past invoices as PDF</li>
            <li>Cancel your subscription</li>
          </ul>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            All changes made in the Stripe portal take effect immediately and are reflected
            in LYRA within a few minutes.
          </p>
        </Subsection>

        <Subsection title="Cancelling your subscription">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Open the Stripe Billing Portal (via <Strong>Account → Billing → Manage subscription</Strong>)
            and click <Strong>Cancel plan</Strong>. Cancellation takes effect at the end of your
            current billing period. You retain full access to all paid features until then.
            After the period ends, your account downgrades to a free read-only state — you
            can still log in and view your data, but scheduling, AI features, and new
            social connections are disabled.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            If you change your mind before the billing period ends, open the portal again and
            click <Strong>Resume plan</Strong> to reactivate. No charge is needed — your next
            regular billing cycle continues as normal.
          </p>
        </Subsection>

        <Subsection title="Refund policy">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            LYRA does not offer refunds for partial months. If you are charged and cancel
            immediately, you retain access for the remainder of the billing period — effectively
            you have already paid for that time.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            If you believe you were charged in error — for example, a duplicate charge or a
            charge after cancellation — contact{' '}
            <a href="mailto:billing@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
              billing@lyraonline.ai
            </a>{' '}
            within 14 days and we will investigate. Include your account email and the
            approximate charge date.
          </p>
        </Subsection>

        <Subsection title="Free trial">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Pro and Agency plans include a 14-day free trial. No credit card is required to start.
            At the end of the trial, you will be prompted to enter payment details to continue.
            If you do not enter payment details, your account automatically reverts to Starter
            at the end of the trial period.
          </p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            Trial accounts have full access to all features of the trialled plan. Any workspaces,
            posts, and brand profiles created during the trial are preserved if you subscribe.
          </p>
        </Subsection>

        <Subsection title="Invoices">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Invoices are generated automatically by Stripe on each billing date and emailed to
            the billing email address on your account. To download a PDF copy of any invoice, open
            the Stripe Billing Portal and click <Strong>Invoices</Strong>. All historical invoices
            are available.
          </p>
        </Subsection>

        <Subsection title="Need help?">
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            For any questions not covered here, reach out to the LYRA support team:
          </p>
          <div className="mt-3 space-y-1 font-sans text-sm text-text-secondary">
            <p>
              <Strong>General support:</Strong>{' '}
              <a href="mailto:support@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
                support@lyraonline.ai
              </a>
            </p>
            <p>
              <Strong>Billing enquiries:</Strong>{' '}
              <a href="mailto:billing@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
                billing@lyraonline.ai
              </a>
            </p>
            <p>
              <Strong>Privacy and data requests:</Strong>{' '}
              <a href="mailto:privacy@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
                privacy@lyraonline.ai
              </a>
            </p>
          </div>
          <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
            We aim to respond to all support requests within one business day (AEST).
          </p>
        </Subsection>
      </section>

    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/*  Shared layout components                                          */
/* ────────────────────────────────────────────────────────────────── */

function Divider() {
  return <hr className="border-background-border" />
}

function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="space-y-2">
      <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">{n}</p>
      <h2 className="font-display text-3xl text-text-primary">{title}</h2>
    </div>
  )
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-sans text-sm font-medium text-text-primary">{title}</h3>
      <div className="space-y-3 font-sans text-sm text-text-secondary leading-relaxed">
        {children}
      </div>
    </div>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-text-primary">{children}</strong>
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-2">{children}</ol>
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 font-sans text-sm text-text-secondary">
      <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">{n}.</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-background-secondary border border-background-border">
      <p className="font-sans text-xs text-text-tertiary leading-relaxed">
        <span className="font-medium text-text-secondary">Note: </span>
        {children}
      </p>
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-background-secondary border border-background-border">
      <p className="font-sans text-sm text-text-secondary">{children}</p>
    </div>
  )
}

function PlatformBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs text-accent-silver bg-background-secondary border border-background-border mr-1.5">
      {children}
    </span>
  )
}

function StatusBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-sans text-xs border mx-0.5 ${color}`}>
      {children}
    </span>
  )
}

function StatusRow({ status, color, children }: { status: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 pt-0.5">
        <StatusBadge color={color}>{status}</StatusBadge>
      </div>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

function PlatformRow({ name, availability, children }: { name: string; availability: string; children: React.ReactNode }) {
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

function PermRow({ platform, permission, children }: { platform: string; permission: string; children: React.ReactNode }) {
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

function AutonomyCard({ name, plan, children }: { name: string; plan: string; children: React.ReactNode }) {
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

function GuardrailRow({ type, children }: { type: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 rounded-xl bg-background-secondary border border-background-border space-y-2">
      <p className="font-sans text-sm font-medium text-text-primary">{type}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

function MetricRow({ metric, children }: { metric: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <p className="font-sans text-sm font-medium text-text-primary shrink-0 w-36">{metric}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

function VoiceField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <p className="font-sans text-sm font-medium text-text-primary shrink-0 w-44">{label}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

function PlanCard({ name, price, description, features }: { name: string; price: string; description: string; features: string[] }) {
  return (
    <div className="px-5 py-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-sans text-sm font-medium text-text-primary">{name}</p>
          <p className="font-sans text-xs text-text-tertiary leading-relaxed">{description}</p>
        </div>
        <p className="font-mono text-sm text-accent-silver shrink-0 ml-6">{price}</p>
      </div>
      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 font-sans text-xs text-text-secondary">
            <span className="shrink-0 mt-0.5 text-status-success">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}
