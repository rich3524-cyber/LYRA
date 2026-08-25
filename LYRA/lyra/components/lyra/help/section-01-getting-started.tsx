import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

export function GettingStartedSection() {
  return (
    <section id="getting-started" className="space-y-8 scroll-mt-28">
      <SectionHeader n="01" title="Getting Started" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA is a social media intelligence platform built for agencies, freelancers, and growing
        businesses. It centralises every aspect of social media management — scheduling content,
        generating AI-powered captions calibrated to each client&apos;s brand voice, responding to
        comments automatically, and tracking performance — all from a single interface.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The platform is structured around <Strong>workspaces</Strong>. Each workspace represents
        one client or brand, with its own social accounts, brand intelligence profile, content
        calendar, inbox, SEO data, and analytics. Switching between clients takes one click.
      </p>

      <Subsection title="Creating your account">
        <Steps>
          <Step n={1}>
            <Strong>lyraonline.ai</Strong> currently shows a waitlist page, not a live signup
            form — it collects an email address for the founding-member offer. If you already
            have access, use the <Strong>Sign in</Strong> link in the top right instead.
          </Step>
          <Step n={2}>
            Sign in with Google or an email/password prompt hosted by LYRA&apos;s login provider.
            There is no separate registration step: your account is created automatically the
            first time you sign in successfully.
          </Step>
          <Step n={3}>
            An agency is created for you automatically, named after your account (e.g.{' '}
            <Strong>&quot;Jane Smith&apos;s Agency&quot;</Strong>). There is no step where you
            type in a business name — you can invite teammates and add client workspaces once
            you&apos;re in.
          </Step>
          <Step n={4}>
            Which plan you&apos;re billed for is determined by the checkout link you use, not an
            in-app plan picker — if none is specified, checkout defaults to Pro. Every plan
            includes a <Strong>30-day free trial</Strong>, and Stripe requires your card details
            up front to start checkout.
          </Step>
          <Step n={5}>
            After checkout you land on a confirmation screen with an <Strong>Enter LYRA</Strong>{' '}
            button — you are not dropped straight into the dashboard.
          </Step>
        </Steps>
        <Note>
          Your name, email, and avatar are pulled from your login provider and shown read-only
          under <Strong>Account → Profile</Strong>. To change them, update them at the provider
          (e.g. your Google account) rather than in LYRA.
        </Note>
      </Subsection>

      <Subsection title="The dashboard">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The dashboard is your overview screen. It does not belong to any single workspace —
          it shows a summary across all of them. From here you can see:
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>
            Three counts covering every workspace you have access to: pending comments, posts
            scheduled today, and posts published or scheduled this week
          </li>
          <li>
            A setup checklist for your highest-plan workspace if it&apos;s still missing a
            website URL, a connected social account, or a brand profile — once the first two are
            done, this becomes a single &quot;Build brand profile&quot; prompt instead
          </li>
          <li>A card for each of your workspaces, showing connected platforms and any comments pending a reply</li>
          <li>
            Quick action shortcuts to compose a post, view the inbox, and add a new workspace —
            the compose/inbox shortcuts always open your first workspace, not necessarily the one
            you were last working in
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          To dive into a specific client, click their workspace from the workspace switcher in
          the top of the sidebar — every part of the app immediately switches context to that client.
        </p>
      </Subsection>

      <Subsection title="Navigating the app">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The left sidebar is the primary navigation on larger screens. Below that breakpoint, it
          is replaced entirely by a hamburger menu that opens a full slide-out drawer — it does
          not shrink to icon-only at smaller widths. On larger screens, a chevron toggle next to
          the sidebar lets you manually collapse it to icon-only.
        </p>
        <ul className="space-y-2 font-sans text-sm text-text-secondary">
          <li>
            <Strong>Workspace switcher (top of sidebar)</Strong> — shows your current workspace.
            Click to open a list of all workspaces and switch between them, or create a new one.
            It is hidden when the sidebar is collapsed to icon-only.
          </li>
          <li>
            <Strong>Dashboard</Strong> — despite the shared name, this is <em>not</em> the
            cross-workspace overview described above. It opens the active workspace&apos;s own
            overview page — the same page you land on by picking a workspace from the switcher —
            with workspace-scoped stats (Scheduled this week, Pending responses, Connected
            accounts) and that workspace&apos;s recent posts.
          </li>
          <li>
            <Strong>Calendar</Strong> — the monthly content calendar for the active workspace.
          </li>
          <li>
            <Strong>Compose</Strong> — open the post composer to draft, generate, and schedule content.
          </li>
          <li>
            <Strong>Inbox</Strong> — all comments and replies from connected social platforms.
          </li>
          <li>
            <Strong>Brand AI</Strong> — the AI brand profile for the active workspace.
          </li>
          <li>
            <Strong>Competitors</Strong> — competitor tracking for the active workspace. Requires
            the Pro or Agency plan.
          </li>
          <li>
            <Strong>Repurpose</Strong> — turn existing content into new posts for other platforms.
          </li>
          <li>
            <Strong>Analytics</Strong> — social media performance data for the active workspace.
          </li>
          <li>
            <Strong>SEO</Strong> — Google Search Console performance data for the active workspace.
          </li>
          <li>
            <Strong>Trends</Strong> — intended to appear only for workspaces with the Trends
            add-on enabled, but currently a wiring gap means it doesn&apos;t render in the sidebar
            for any workspace. The add-on itself is real and purchasable from{' '}
            <Strong>Settings → Add-ons</Strong>; if you&apos;ve bought it, the feature is still
            reachable directly at the workspace&apos;s <Strong>/trends</Strong> URL, just not
            linked from the nav.
          </li>
          <li>
            <Strong>Settings</Strong> — pinned by itself at the bottom of the sidebar, separate
            from the rest. Covers connected social accounts, timezone, and the AI autonomy level
            for the active workspace, plus that workspace&apos;s add-ons. There is no
            client-access editor here (client access is set once when the workspace is created)
            and no guardrails screen — the only guardrail control, Crisis Keywords, lives on the
            Brand AI page instead.
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          At the top right of every page you will find an <Strong>Upgrade</Strong> button if
          you&apos;re on Starter or Pro (or an &quot;Agency Plan&quot; link if you&apos;re on
          Agency), and your account avatar. There is no search icon or command palette. Clicking
          the avatar opens a menu with <Strong>Account</Strong> and <Strong>Sign out</Strong> —
          billing lives one level deeper, inside Account, rather than as its own menu item.
        </p>
      </Subsection>

      <Subsection title="Recommended setup order">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          For the best experience, complete these steps for each new client workspace:
        </p>
        <Steps>
          <Step n={1}>Create the workspace with the client&apos;s name, website URL, and industry.</Step>
          <Step n={2}>Connect all relevant social media accounts in <Strong>Settings → Social Accounts</Strong>.</Step>
          <Step n={3}>Build the brand profile in <Strong>Brand AI</Strong>.</Step>
          <Step n={4}>Connect Google Search Console in <Strong>SEO</Strong> if you manage their website SEO.</Step>
          <Step n={5}>Schedule the first batch of posts using the composer and calendar.</Step>
          <Step n={6}>Set the AI autonomy level in <Strong>Settings</Strong> to match how hands-off you want inbox responses to be.</Step>
        </Steps>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Steps 1–3 matter most: AI caption generation requires a brand profile to exist for that
          workspace and fails without one, and without one, incoming comments are escalated for
          manual review rather than answered automatically. Everything else can be configured at
          any time.
        </p>
      </Subsection>
    </section>
  )
}
