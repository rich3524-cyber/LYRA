import { SectionHeader, Subsection, Strong, Steps, Step, Note, StatusBadge } from './primitives'

export function ComposeSection() {
  return (
    <section id="compose" className="space-y-8 scroll-mt-28">
      <SectionHeader n="06" title="Compose" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The composer is where you create, edit, and schedule posts. Write your caption once and
        it goes out to every platform you select — LYRA sends the same caption text to all of
        them; there is no per-platform caption editor. An <Strong>AI Generate</Strong> button in
        the toolbar can produce a single caption in the workspace&apos;s brand voice as a
        starting point.
      </p>

      <Subsection title="Selecting platforms">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          At the top of the composer, the <Strong>Platform selector</Strong> shows the platforms
          this workspace has connected. Click a platform icon to toggle it on or off for this
          post — you can select just one or several at once.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The caption is shared across every platform you select — there is no way to write a
          different caption per platform. Media works differently: see{' '}
          <Strong>Customise per platform</Strong> under Adding media below.
        </p>
      </Subsection>

      <Subsection title="Writing your caption">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The editor supports real formatting while you type — bold and italic (including via
          Ctrl+B / Ctrl+I or markdown shortcuts like <Strong>**bold**</Strong>), headings, and
          bullet/numbered lists all render visibly in the editor. There is no hashtag or @mention
          highlighting, emoji picker, or link preview.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          This matters: none of that formatting survives publishing. LYRA extracts plain text from
          the editor before sending it anywhere, so a bullet list or bolded phrase that looks
          correct on screen goes out as plain text with the formatting silently stripped — a line
          typed as &ldquo;- Item one&rdquo; publishes as &ldquo;Item one&rdquo; with no bullet.
          Don&apos;t rely on visual formatting in the editor to mean anything once the post is
          scheduled.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          A live character count appears only in the preview panel next to the composer, and only
          for two of the platforms you can post to: <Strong>Instagram</Strong> (2,200 characters)
          and <Strong>X</Strong> (280 characters) — it turns red past the limit as a warning. For
          every other platform, including LinkedIn, Facebook, TikTok, and Google Business, there
          is no character count shown anywhere in the composer. Either way, LYRA does not block
          scheduling or trim your caption if it runs over a platform&apos;s limit — that&apos;s on
          you to check.
        </p>
      </Subsection>

      <Subsection title="AI caption generation">
        <Steps>
          <Step n={1}>
            Click <Strong>AI Generate</Strong> in the toolbar above the editor. This requires a
            completed Brand AI profile for the workspace — if one hasn&apos;t been built yet, LYRA
            shows an error instead of generating anything.
          </Step>
          <Step n={2}>
            LYRA writes a single caption in the brand&apos;s voice and drops it straight into the
            editor, replacing whatever was already there. There is no prompt box to add a topic or
            brief from inside the composer, and no set of variations to pick from — it&apos;s one
            caption, inserted directly. The instruction sent to the model explicitly asks for the
            caption text only, with no alternatives.
          </Step>
          <Step n={3}>
            There is no separate Regenerate or Refine control. To try again, click{' '}
            <Strong>AI Generate</Strong> a second time — it produces another single caption and
            overwrites the editor&apos;s contents again.
          </Step>
          <Step n={4}>
            Always review and edit the AI output before scheduling. The prompt asks the model to
            include relevant hashtags directly in the caption where appropriate for the platform —
            there is no separate hashtag-suggestion tool, so if you want hashtags and the AI
            didn&apos;t add the ones you need, add them yourself.
          </Step>
        </Steps>
      </Subsection>

      <Subsection title="Adding media">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Media</Strong> in the toolbar (or drag and drop files onto the composer)
          to attach images or video.
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary">
          <li><Strong>Images:</Strong> JPG, PNG, GIF, WEBP</li>
          <li><Strong>Video:</Strong> MP4, MOV, WEBM — AVI is not on the accepted list and is rejected by the upload endpoint</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Every file — image or video — shares one flat <Strong>50 MB</Strong> size cap; there is
          no separate, larger limit for video. There is also no limit on how many images you can
          attach to a single post.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          As soon as media is attached and a platform is selected, LYRA checks the file against
          that platform&apos;s known format restrictions and shows a warning immediately in the
          composer — you do not need to schedule or submit the post to find out. Right now that
          check only covers Instagram: it accepts JPEG and PNG images only, so a GIF or WebP
          attached to a post targeting Instagram is flagged right away, with a note that it will
          fail to publish there if left unchanged. The same check runs again on the server when
          you schedule, as a backstop.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          To remove an attached file, hover over its thumbnail and click the <Strong>×</Strong>
          button in the corner.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Once platforms are selected and at least one shared file is attached, a{' '}
          <Strong>Customise per platform</Strong> button appears below the media strip — this is
          real, but it only applies to media, not captions. Turning it on replaces the shared
          media thumbnails with one tab per selected platform, useful when one file genuinely
          doesn&apos;t work everywhere (e.g. a 9:16 TikTok video vs. a 1:1 Instagram square). Each
          tab shows the shared media dimmed as a fallback; uploading to a tab overrides the shared
          media for that platform only, and a small dot on a tab&apos;s label marks that it has an
          override set.
        </p>
      </Subsection>

      <Subsection title="Scheduling a post">
        <Steps>
          <Step n={1}>
            Click the date/time control at the bottom right of the composer (it reads{' '}
            <Strong>Pick date &amp; time</Strong> until you set one) to open the picker.
          </Step>
          <Step n={2}>
            Pick a date on the calendar and set the time in the field below it. The picker does
            not display a timezone, and despite the timezone setting on the workspace&apos;s
            Settings page, that setting is not used here — the time you enter is interpreted in
            your own browser&apos;s local timezone. Two team members in different timezones
            picking &ldquo;3:00 PM&rdquo; for the same post are scheduling it for two different
            moments.
          </Step>
          <Step n={3}>
            If LYRA has enough posting history for the first platform you&apos;ve selected (at
            least 12 published posts on that platform), a <Strong>Best time for…</Strong> hint
            appears above the buttons with a suggested day and time, plus a{' '}
            <Strong>Use this time</Strong> link that fills the picker with it. This is an inline
            hint next to the toolbar, not a button inside the date picker — and it simply
            doesn&apos;t appear at all until there is enough history behind it.
          </Step>
          <Step n={4}>
            Click <Strong>Schedule</Strong>. The post is queued and a confirmation toast appears;
            the composer then clears itself, ready for the next post. A separate{' '}
            <Strong>Post now</Strong> button next to it schedules the post for immediate
            publishing without opening the date picker at all.
          </Step>
        </Steps>
        <Note>
          LYRA does not currently enforce a scheduling window, a minimum lead time, or a rule
          against backdating — the picker lets you select any date and time, including one in the
          past, and nothing blocks submission if you do.
        </Note>
      </Subsection>

      <Subsection title="Saving as draft">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Save draft</Strong> instead of Schedule to save the post without queuing
          it. Drafts appear on the calendar on the date you set, but with a grey Draft status.
          They will not be published automatically — you must return and schedule them manually.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          There is no autosave. Unsaved changes live only in the browser tab while the composer is
          open — LYRA does not save them in the background, on a timer, or before you navigate
          away, and there is no confirmation prompt if you close the tab or leave the page with
          unsaved changes. Click <Strong>Save draft</Strong> or <Strong>Schedule</Strong>{' '}
          explicitly before leaving, or your changes are lost.
        </p>
      </Subsection>

      <Subsection title="Sending for client approval">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          There is no separate <Strong>Send for approval</Strong> button. If the workspace has
          client approval enabled, clicking the ordinary <Strong>Schedule</Strong> button routes
          the post through approval automatically: LYRA checks the workspace&apos;s client-approval
          setting on the server and, if it&apos;s on, saves the post with a{' '}
          <StatusBadge color="text-status-warning border-status-warning/30">Pending Approval</StatusBadge>{' '}
          status instead of Scheduled. You do not choose between the two when submitting — the
          request looks identical either way. Anyone with approval permissions on the workspace
          can approve it from their own login — usually the client, but agency staff can too if
          the client isn&apos;t the one reviewing that day.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Approving a post created from the composer takes it straight to{' '}
          <Strong>Scheduled</Strong> as long as it has a scheduled time — a normal composer post
          isn&apos;t required to have media before it can be approved and scheduled (that
          requirement only applies to posts generated by the AI Schedule Generator without
          artwork). If it&apos;s missing a scheduled time, it stays at <Strong>Approved</Strong>{' '}
          and nothing moves it further on its own — there&apos;s no automatic transition once
          you add what was missing. You need to open the post and click{' '}
          <Strong>Schedule post</Strong> yourself to move it to Scheduled.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          No notification currently fires when a post scheduled from the composer lands in Pending
          Approval — not email, and not Slack either, even on a workspace with a Slack channel
          connected and its &ldquo;New post pending approval&rdquo; toggle turned on. That
          notification exists in LYRA and does fire for approval status changes made from the
          calendar&apos;s post detail panel, but the composer&apos;s own Schedule button doesn&apos;t
          trigger it today. The approver needs to check LYRA directly to see what&apos;s pending.
        </p>
      </Subsection>
    </section>
  )
}
