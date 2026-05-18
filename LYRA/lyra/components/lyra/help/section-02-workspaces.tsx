import { SectionHeader, Subsection, Strong, Steps, Step, Note, InfoBox } from './primitives'

export function WorkspacesSection() {
  return (
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
  )
}
