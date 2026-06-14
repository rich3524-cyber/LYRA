import { SectionHeader, Subsection, Strong, Steps, Step, Note, StatusBadge } from './primitives'

export function ComposeSection() {
  return (
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
  )
}
