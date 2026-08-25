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
            Click the workspace name at the top of the sidebar (only visible when the sidebar is
            expanded) to open the workspace switcher panel.
          </Step>
          <Step n={2}>
            Click <Strong>New workspace</Strong> at the bottom of the panel. This takes you to a
            dedicated <Strong>New workspace</Strong> page.
          </Step>
          <Step n={3}>
            Enter the <Strong>Client name</Strong> — this is a required field. It&apos;s typically the
            client&apos;s brand name (e.g. &ldquo;Harbour Dental&rdquo; or &ldquo;Coastal Running Co.&rdquo;). Unlike
            an internal-only label, this name is also shown to the client if they have portal
            access (see <Strong>Client access</Strong> below).
          </Step>
          <Step n={4}>
            Optionally select an <Strong>Industry</Strong>. This is descriptive only — it&apos;s shown
            as a subtitle on the workspace overview page but currently doesn&apos;t feed into AI
            caption generation or any other AI prompt.
          </Step>
          <Step n={5}>
            Optionally enter a <Strong>Website URL</Strong>, including
            <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">https://</code>
            . If provided, this is what LYRA crawls later to build the AI brand profile from the
            Brand AI page.
          </Step>
          <Step n={6}>
            Choose a <Strong>Client access</Strong> level: <Strong>No access</Strong>,{' '}
            <Strong>View only</Strong>, or <Strong>Approve posts</Strong>. This controls what the
            client can see and do in their own portal, and is worth more thought than it might
            look — it&apos;s a more consequential choice than Industry, even though it appears after
            it in the form.
          </Step>
          <Step n={7}>
            Click <Strong>Create workspace</Strong>. You&apos;re taken to the new workspace&apos;s
            overview page.
          </Step>
        </Steps>
        <Note>
          Neither <Strong>New workspace</Strong> nor <Strong>Create workspace</Strong> is ever
          disabled based on your plan — there&apos;s no upfront check or upgrade prompt. If you&apos;re
          already at your plan&apos;s workspace limit, the create step fails only after you&apos;ve
          filled in the entire form and clicked <Strong>Create workspace</Strong>, showing an
          error message at that point instead. This limit is also only enforced for accounts with
          an associated agency/billing relationship — an account with no agency yet isn&apos;t
          limited.
        </Note>
      </Subsection>

      <Subsection title="Switching between workspaces">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click the workspace name at the top of the sidebar to open the switcher. It&apos;s only
          available when the sidebar is expanded — collapsing the sidebar hides it. Your
          workspaces are listed alphabetically by name. Click any workspace to switch to it
          instantly. The entire app — calendar, inbox, brand, SEO, analytics, and settings —
          switches to show data for the selected workspace, and the URL updates to reflect the
          active workspace ID.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          You can also bookmark direct deep links. For example, if a client&apos;s workspace ID is
          <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md mx-1">cm2k9x0h20001qzrm4f8j2abc</code>,
          you can bookmark
          <code className="font-mono text-xs text-accent-silver bg-background-secondary px-1.5 py-0.5 rounded-md ml-1">lyraonline.ai/workspace/cm2k9x0h20001qzrm4f8j2abc/calendar</code>
          &nbsp;to jump directly to their calendar. (Workspace IDs are generated as cuids, not the
          short, human-readable form shown here — this is just an example of the shape.)
        </p>
      </Subsection>

      <Subsection title="Changing workspace details later">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Of the fields set when you create a workspace — Client name, Website URL, and Industry —
          only <Strong>Timezone</Strong> can later be changed, in <Strong>Settings</Strong> (it
          affects post scheduling, bulk-import date parsing, and Slack notification timestamps).
          There is no &ldquo;General&rdquo; tab or details screen anywhere in Settings, and there&apos;s no
          path to edit Client name, Website URL, or Industry from inside the dashboard. (Settings
          does let you change several other workspace settings — autonomy mode, Crisis Aware, and
          approval deadlines — just not these creation-time fields.)
        </p>
        <Note>
          The Brand AI page&apos;s setup checklist shows a <Strong>Go to Settings</Strong> button when
          a workspace has no website URL, which implies you can add one there — Settings has no
          field for it. If a workspace was created without a website URL, there&apos;s currently no
          path to add one from inside the dashboard.
        </Note>
      </Subsection>

      <Subsection title="Workspace overview page">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Clicking a workspace in the switcher takes you to its overview page. The header shows
          the workspace name, with the Industry shown underneath it as a small subtitle if one was
          set. Below that are three stat cards — <Strong>Scheduled this week</Strong> (posts
          scheduled in the next 7 days),{' '}
          <Strong>Pending responses</Strong> (comments awaiting a reply, highlighted when above
          zero), and <Strong>Connected accounts</Strong> (highlighted when zero) — each linking to
          the relevant page. Below the stat cards is a list of your 5 most recently created posts
          with their status and platform, and a shortcut to Compose. It does not show brand-build
          status or a dedicated action-items list.
        </p>
      </Subsection>

      <Subsection title="Deleting a workspace">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          In <Strong>Settings</Strong>, scroll to the <Strong>Danger Zone</Strong> at the bottom
          and click <Strong>Delete workspace</Strong>. A confirmation dialog appears naming the
          workspace — clicking <Strong>Delete workspace</Strong> in that dialog deletes it
          immediately. There&apos;s no text field to type the workspace name to confirm. This
          permanently and irreversibly deletes:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>All posts (drafts, scheduled, and published records)</li>
          <li>All comments and comment responses</li>
          <li>The brand intelligence profile</li>
          <li>All post analytics/metrics data</li>
          <li>All connected social accounts</li>
          <li>Guardrails (including Crisis Keywords)</li>
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
