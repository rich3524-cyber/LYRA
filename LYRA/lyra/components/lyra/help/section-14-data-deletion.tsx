import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

export function DataDeletionSection() {
  return (
    <section id="data-deletion" className="space-y-8 scroll-mt-28">
      <SectionHeader n="14" title="Data Deletion" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        When you connect a Facebook or Instagram account to LYRA, LYRA stores an OAuth access token
        and the metadata returned during the connection flow (Page name, Page ID, and account type).
        This data is used exclusively to publish posts and read and respond to comments on your behalf.
        You can remove this data at any time.
      </p>

      <Subsection title="Disconnect a social account">
        <p>
          Disconnecting removes the stored access token and stops all publishing and monitoring for
          that account immediately.
        </p>
        <Steps>
          <Step n={1}>
            Open the workspace and go to <Strong>Settings → Social Accounts</Strong>.
          </Step>
          <Step n={2}>
            Find the Facebook or Instagram account you want to remove.
          </Step>
          <Step n={3}>
            Click the three-dot menu next to the account and select <Strong>Disconnect</Strong>.
          </Step>
          <Step n={4}>
            Confirm the disconnection. The stored token is deleted immediately.
          </Step>
        </Steps>
        <Note>
          To fully revoke LYRA&apos;s access at the platform level, also remove the app from
          Facebook Settings → Security and Login → Business Integrations.
        </Note>
      </Subsection>

      <Subsection title="Request complete data deletion">
        <p>
          To request deletion of all data LYRA holds that originated from your Facebook or Instagram
          connection — including stored tokens, Page metadata, post records, and comment history
          associated with that account — send a request to{' '}
          <Strong>hello@lyraonline.ai</Strong> with the subject line{' '}
          <Strong>Data deletion request</Strong>.
        </p>
        <p>
          Include the email address associated with your LYRA account and the name of the
          Facebook Page or Instagram account you want removed. LYRA will complete the deletion
          within 30 days and send a confirmation to your email address.
        </p>
        <Note>
          Deleting a social account&apos;s data will also remove any posts, comments, and AI response
          records associated with that account. This action cannot be undone.
        </Note>
      </Subsection>

      <Subsection title="Delete your LYRA account">
        <p>
          To delete your entire LYRA account and all associated data — including all workspaces,
          posts, brand profiles, and connected social accounts — go to{' '}
          <Strong>Account → Billing → Delete account</Strong>, or send a request to{' '}
          <Strong>hello@lyraonline.ai</Strong>.
        </p>
        <p>
          Account deletion is permanent. All data is removed within 30 days of the request.
          Active subscriptions are cancelled immediately with no further charges.
        </p>
      </Subsection>
    </section>
  )
}
