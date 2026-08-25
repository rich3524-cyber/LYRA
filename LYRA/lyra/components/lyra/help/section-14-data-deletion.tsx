import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

export function DataDeletionSection() {
  return (
    <section id="data-deletion" className="space-y-8 scroll-mt-28">
      <SectionHeader n="14" title="Data Deletion" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        When you connect a Facebook or Instagram account to LYRA, LYRA stores an encrypted access
        token, a refresh token, the token&apos;s expiry, a webhook subscription ID, and the metadata
        returned during the connection flow (Page name, Page ID, and account type). This data is
        used to publish posts and read and respond to comments on your behalf.
      </p>

      <Subsection title="Disconnect a social account">
        <p>
          Disconnecting a social account stops LYRA from publishing to it or monitoring its comments,
          but it does <Strong>not</Strong> delete the account&apos;s stored data. The connection is
          marked inactive; the encrypted access token, refresh token, token expiry, and webhook
          subscription ID all remain in LYRA&apos;s database. There is also no confirmation step —
          clicking Disconnect takes effect immediately.
        </p>
        <Steps>
          <Step n={1}>
            Open the workspace and go to <Strong>Settings → Social Accounts</Strong>.
          </Step>
          <Step n={2}>
            Find the Facebook or Instagram account you want to remove.
          </Step>
          <Step n={3}>
            Click <Strong>Disconnect</Strong> next to the account. This runs immediately —
            there is no confirmation dialog.
          </Step>
        </Steps>
        <Note>
          To fully revoke LYRA&apos;s access at the platform level, also remove the app from
          Facebook Settings → Security and Login → Business Integrations. This is currently the
          only way to fully revoke access, since disconnecting inside LYRA does not call Facebook
          to revoke the token, and requesting data deletion (below) does not remove the token
          from LYRA&apos;s database either.
        </Note>
      </Subsection>

      <Subsection title="Request complete data deletion">
        <p>
          LYRA does not have a way to delete a single connected account&apos;s data on its own —
          every deletion path removes an entire workspace at a time, connected accounts included.
          To request deletion of a specific account&apos;s data, send a request to{' '}
          <Strong>hello@lyraonline.ai</Strong> with the subject line{' '}
          <Strong>Data deletion request</Strong>, and include the email address associated with
          your LYRA account and the name of the Facebook Page or Instagram account you want removed.
          LYRA does not currently expose a Meta Data Deletion Request Callback endpoint; this manual,
          email-based process is how such requests are handled today.
        </p>
        <p>
          LYRA will complete the deletion within 30 days and send a confirmation to your email
          address.
        </p>
        <Note>
          Deleting a workspace&apos;s data also removes its posts, comments, and AI response
          records. One exception: pending Facebook Page-selection data (created while a connection
          is in progress and normally short-lived) is not included in this deletion process. This
          action cannot be undone.
        </Note>
      </Subsection>

      <Subsection title="Delete your LYRA account">
        <p>
          To delete your entire LYRA account, go to{' '}
          <Strong>Account → Danger Zone</Strong> and use <Strong>Delete account</Strong>, or send
          a request to <Strong>hello@lyraonline.ai</Strong>. This permanently deletes your user
          record and every workspace you own — including their posts, brand profiles, and
          connected social accounts. Workspaces you only have shared access to (as a team member
          or client, rather than an owner) are not deleted; LYRA only removes your access to them.
        </p>
        <p>
          If you have authored posts in a shared workspace you don&apos;t own, account deletion can
          currently fail, since those posts are not removed by this process and block the deletion
          of your user record. If this happens, contact <Strong>hello@lyraonline.ai</Strong> for
          manual assistance.
        </p>
        <p>
          Account deletion is permanent. All data from the deleted workspaces is removed within 30
          days of the request. If you are the last owner of your agency, its subscription (including
          the Crisis Aware add-on, if active) is cancelled as part of the deletion — no further
          charges apply. If your agency has other owners, its shared subscription is left active for
          them, and only your own owned workspaces and their add-on subscriptions are cancelled and
          removed.
        </p>
      </Subsection>
    </section>
  )
}
