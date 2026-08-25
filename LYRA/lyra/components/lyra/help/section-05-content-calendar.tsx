import { SectionHeader, Subsection, Strong, Note, StatusRow } from './primitives'

export function ContentCalendarSection() {
  return (
    <section id="content-calendar" className="space-y-8 scroll-mt-28">
      <SectionHeader n="05" title="Content Calendar" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        The content calendar gives you a visual overview of all scheduled and published posts
        for the active workspace. It is a planning and review tool — from here you can see what
        is going out, when, and on which platforms. You can reschedule posts by dragging them
        between days, open a post to see its full details, or jump into the composer to write
        new content.
      </p>

      <Subsection title="Reading the calendar">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The calendar shows one full month at a time. Each day cell may contain zero or more
          post chips, plus any email campaigns scheduled that day (see{' '}
          <Strong>Email campaigns on the calendar</Strong> below). There is no per-day limit or
          &quot;show more&quot; control — a busy day simply grows the cell to fit everything in it.
          Each post chip shows:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>A small coloured dot for the platform (not a platform logo/icon)</li>
          <li>A status badge in the top-right corner of the chip (not a coloured border)</li>
          <li>A snippet of the caption, clamped to two lines — how much text that shows depends on how long each line wraps, not a fixed character count</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          The desktop chip does <Strong>not</Strong> show the scheduled time. If you need the
          time at a glance, use the mobile agenda view (below) or open the post&apos;s detail
          panel. Each day header also shows a small coloured dot per platform that has a post on
          that day, so you can scan the month for platform coverage without opening anything.
        </p>
      </Subsection>

      <Subsection title="Post status indicators">
        <div className="space-y-2">
          <StatusRow status="Draft" color="text-text-tertiary border-background-border-mid">
            The post has been saved but is not yet scheduled. A draft only appears on the
            calendar once it has a scheduled date/time set — a draft with no scheduled date does
            not appear on the calendar at all, on its creation date or otherwise. You can still
            find it from the composer or the workspace&apos;s post list.
          </StatusRow>
          <StatusRow status="Pending Approval" color="text-status-warning border-status-warning/30">
            The post has been submitted for review and is waiting on a decision from anyone
            with approval permissions on the workspace — agency staff, or on workspaces with
            client review turned on, the client too. Click the post chip to open its detail
            panel, where an <Strong>Approve</Strong> and <Strong>Request changes</Strong> button
            appear for anyone authorized to decide. If a post sits past its approval deadline,
            its badge switches to an amber <Strong>Approval overdue</Strong> label instead.
          </StatusRow>
          <StatusRow status="Approved" color="text-text-tertiary border-background-border-mid">
            The post was approved but hasn&apos;t been scheduled yet — it renders with the same
            neutral badge as Draft, <Strong>not</Strong> the amber warning colour, unless it&apos;s
            also missing media (see below). It does <Strong>not</Strong> move to Scheduled on its
            own. Once the post has both media and a scheduled time, open its detail panel and
            click <Strong>Schedule post</Strong> — that transition is always a manual click, never
            automatic.
          </StatusRow>
          <StatusRow status="Scheduled" color="text-status-info border-status-info/30">
            The post is approved and queued for automatic publishing at the scheduled time.
            LYRA&apos;s background publishing worker picks it up and publishes it; while a
            publish attempt is in progress the post briefly shows as Publishing before settling
            into Published or Failed.
          </StatusRow>
          <StatusRow status="Published" color="text-status-success border-status-success/30">
            The post was successfully published to the platform. Its detail panel shows the
            same scheduled date/time as before publishing — there is currently no separate
            publish timestamp shown, and no link back to the live post on the platform.
          </StatusRow>
          <StatusRow status="Failed" color="text-status-error border-status-error/30">
            An error occurred during publishing — the underlying error message from the
            platform is shown on the chip and in the detail panel. The only action available
            on a failed post is <Strong>Move back to draft</Strong>. There is no Retry option
            and no dedicated &quot;edit and reschedule&quot; flow; to try again, move it back to
            draft, fix whatever needs fixing, and resubmit it.
          </StatusRow>
          <StatusRow status="Cancelled" color="text-text-tertiary border-background-border-mid">
            The post was manually cancelled before its scheduled publish time (from the
            <Strong> Cancel post</Strong> action on a Scheduled post). Disconnecting the social
            account a post targets does <Strong>not</Strong> cancel it — a disconnected account
            only stops being usable for new posts; posts already scheduled against it are left
            as-is and will fail at publish time rather than being auto-cancelled.
          </StatusRow>
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Separately, a Draft or Approved post that still needs media shows an amber{' '}
          <Strong>Awaiting media</Strong> badge in place of its normal status colour.
        </p>
      </Subsection>

      <Subsection title="Navigating between months">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          The month name sits on the left of the calendar header; <Strong>Today</Strong> and the
          left/right chevron buttons are grouped together on the right — the chevrons don&apos;t
          flank the month name itself. Click <Strong>Today</Strong> to jump back to the current
          month (it&apos;s disabled while you&apos;re already viewing it). You can navigate
          freely through past and future months to review historical or upcoming post activity.
        </p>
      </Subsection>

      <Subsection title="Rescheduling posts by dragging">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Any post chip can be dragged from one day cell to another, regardless of its status —
          there is no restriction based on Draft, Pending Approval, Approved, Scheduled,
          Published, or Failed. The post time (hour and minute) is preserved — only the date
          changes.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          To change the time as well, click the post chip to open its detail panel, then click{' '}
          <Strong>Edit in Composer</Strong> and update the date/time picker there.
        </p>
        <Note>
          Because dragging has no status guard, dragging a <Strong>Published</Strong> or{' '}
          <Strong>Failed</Strong> post only changes the date shown on the calendar and stored on
          the post — it does not re-publish it, undo the original publish, or change its status.
          Drag those with care; the safer path for a failed post is to move it back to draft
          first.
        </Note>
      </Subsection>

      <Subsection title="Opening a post's details">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click any post chip on the calendar to open a detail panel on the right side of the
          screen. It shows the status (plus an AI badge if the post was AI-generated), the full
          caption, the scheduled date/time, and — if media is attached — a count of how many
          files, not thumbnails or previews of the media itself. From here:
        </p>
        <ul className="space-y-1 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>Click <Strong>Edit in Composer</Strong> to open the post in the full composer</li>
          <li>Click <Strong>Delete post</Strong> to remove it permanently</li>
          <li>
            Depending on the post&apos;s status and your role, an <Strong>Actions</Strong>{' '}
            section offers the relevant next step — Approve / Request changes, Submit for
            approval, Schedule post, Move back to draft, or Cancel post
          </li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          There is no <Strong>Duplicate</Strong> button and no <Strong>View on platform</Strong>{' '}
          link, even for published posts.
        </p>
      </Subsection>

      <Subsection title="Creating a post from the calendar">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Clicking an empty day cell does nothing — there is no per-day &quot;+ New post&quot;
          entry point. To compose a post, use the <Strong>New post</Strong> link in the calendar
          page header (it opens the composer with no date pre-filled), or use the{' '}
          <Strong>Generate schedule</Strong> or <Strong>Bulk import</Strong> tools described
          below to get a batch of posts onto the calendar at once.
        </p>
      </Subsection>

      <Subsection title="Filtering the calendar">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          There is no platform filter. The calendar filters by status only, via a single-select
          row of tabs above the grid: <Strong>All</Strong>, <Strong>Scheduled</Strong>,{' '}
          <Strong>Drafts</Strong>, <Strong>Pending</Strong>, <Strong>Published</Strong>, and{' '}
          <Strong>Failed</Strong>. Each tab shows a count and only one can be active at a time —
          selecting one replaces the previous filter rather than adding to it.
        </p>
      </Subsection>

      <Subsection title="AI Schedule Generator">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Generate schedule</Strong> in the calendar page header to have LYRA plan
          and write a batch of posts — pick a duration (3 or 6 weeks), choose which connected
          platforms to include, and set how many posts per week for each. Generation runs one
          week at a time; within each week, every selected platform is generated concurrently
          rather than one platform after another, and a progress bar tracks which week is
          currently running.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          When generation finishes, click <Strong>Review posts</Strong> to open a separate
          review screen listing every generated post grouped by week — posts aren&apos;t
          streamed into that screen as they&apos;re generated; you only see it once the whole
          batch is done. From there you can edit or delete individual posts and attach media to
          each one before committing anything to the calendar.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Click <Strong>Export captions (CSV)</Strong> to download a caption sheet (date, time,
          platform, topic, caption) — useful for a client sign-off pass. This export only
          includes posts that still have <Strong>no</Strong> media attached; posts you&apos;ve
          already attached media to are silently left out of the file, and if every post already
          has media, the export fails with a &quot;No posts without media to export&quot; error
          instead of downloading anything.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Click <Strong>Add all to calendar</Strong> to save the whole batch — this creates every
          post as a <Strong>Draft</Strong>, not a Scheduled post, regardless of whether media is
          attached. A post that still has no media is marked as requiring it, so it shows the
          amber <Strong>Awaiting media</Strong> badge and won&apos;t offer a{' '}
          <Strong>Schedule post</Strong> action until you attach media to it from the composer.
        </p>
      </Subsection>

      <Subsection title="Bulk import">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Click <Strong>Bulk import</Strong> in the calendar page header (visible to anyone with
          write access) to schedule many posts at once from a spreadsheet. Download the CSV
          template, fill in one row per post, and upload it. Each row is parsed and shown as{' '}
          <Strong>ready</Strong>, <Strong>warning</Strong> (the post itself is valid but there&apos;s
          a media issue — these rows are pre-selected anyway), or <Strong>error</Strong> (blocked
          from import and not selectable). Confirming the import creates the selected rows
          directly as <Strong>Scheduled</Strong> posts (or Pending Approval, on workspaces that
          require client review) — unlike the AI Schedule Generator&apos;s batch, nothing from a
          bulk import lands as a Draft.
        </p>
      </Subsection>

      <Subsection title="Mobile agenda view">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Below a certain screen width, the month grid is replaced by an agenda list: each day
          that has posts or email campaigns gets its own heading, with the posts for that day
          listed underneath showing a platform dot, the scheduled time, and a line of caption
          text. Tapping a post opens the same detail panel used on desktop.
        </p>
      </Subsection>

      <Subsection title="Email campaigns on the calendar">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          If the workspace has an email integration connected (Klaviyo, Mailchimp, or
          Customer.io), scheduled email campaigns appear on the calendar alongside social posts,
          styled in indigo to keep them visually distinct from social platform chips. Each
          campaign chip shows the provider, its status, and its subject line. These chips are
          read-only — clicking one does nothing; campaigns are managed in the connected email
          platform, not from LYRA.
        </p>
      </Subsection>
    </section>
  )
}
