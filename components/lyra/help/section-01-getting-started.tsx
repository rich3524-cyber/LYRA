import { Divider, SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

export function GettingStartedSection() {
  return (
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
            <Strong>Repurpose</Strong> — convert any blog post URL or long-form text into
            platform-native posts for every connected channel simultaneously.
            Available on Pro and Agency plans.
          </li>
          <li>
            <Strong>LYRA Assistant</Strong> — AI-generated quarterly performance reports and
            3-month content strategies built from the workspace&apos;s historical data.
            Available on Pro and Agency plans.
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
  )
}
