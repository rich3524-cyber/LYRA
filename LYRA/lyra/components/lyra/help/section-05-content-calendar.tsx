import { SectionHeader, Subsection, Strong, Note, StatusRow } from './primitives'

export function ContentCalendarSection() {
  return (
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
  )
}
