# Post Now Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Post now" button to the Compose section that publishes immediately without requiring a scheduled date/time.

**Architecture:** The existing `handleSubmit` validates that `scheduledAt` is set for SCHEDULED posts. A new `handlePostNow` function bypasses this check, passes `scheduledAt: new Date()` directly to the same `/api/posts` endpoint, and resets the form on success. No new API routes needed.

**Tech Stack:** React (client component), existing `/api/posts` POST route, Lucide `Zap` icon

---

## File Map

**Modify:**
- `lyra/components/lyra/composer/post-composer.tsx` — add `isPostingNow` state, `handlePostNow` function, Post Now button

---

### Task 1: Add Post Now button to PostComposer

**Files:**
- Modify: `lyra/components/lyra/composer/post-composer.tsx`

- [ ] **Step 1: Read the current file**

Open `lyra/components/lyra/composer/post-composer.tsx` and confirm the import line at the top currently reads:

```tsx
import { Sparkles, CalendarIcon, Send } from 'lucide-react'
```

- [ ] **Step 2: Add `Zap` to the Lucide import**

```tsx
import { Sparkles, CalendarIcon, Send, Zap } from 'lucide-react'
```

- [ ] **Step 3: Add `isPostingNow` state**

After the existing `const [isSubmitting, setIsSubmitting] = useState(false)` line, add:

```tsx
const [isPostingNow, setIsPostingNow] = useState(false)
```

- [ ] **Step 4: Add the `handlePostNow` function**

Add this function directly after the closing brace of `handleSubmit`:

```tsx
const handlePostNow = async () => {
  const content = editor?.getText()
  if (!content?.trim()) { toast.error('Post content is required'); return }
  if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return }
  if (overLimit) { toast.error(`Content exceeds the ${charLimit}-character limit`); return }

  setIsPostingNow(true)
  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        content: content.trim(),
        platforms: selectedPlatforms,
        scheduledAt: new Date().toISOString(),
        mediaUrls,
        status: 'SCHEDULED',
      }),
    })
    if (!res.ok) throw new Error('Failed to post')
    toast.success('Post published immediately')
    editor?.commands.clearContent()
    setSelectedPlatforms([])
    setMediaUrls([])
    setTopic('')
    window.dispatchEvent(new CustomEvent('draft-saved'))
  } catch {
    toast.error('Failed to post')
  } finally {
    setIsPostingNow(false)
  }
}
```

- [ ] **Step 5: Add the Post Now button to the toolbar**

In the toolbar's right-side button group, add the Post Now button between "Save draft" and the schedule Popover. The full right-side `div` should look like this:

```tsx
<div className="flex items-center gap-2">
  {/* Character counter */}
  {charLimit !== null && (
    <span className={cn(
      'font-mono text-xs tabular-nums',
      overLimit ? 'text-status-error' : charCount > charLimit * 0.9 ? 'text-status-warning' : 'text-text-tertiary'
    )}>
      {charCount}/{charLimit}
    </span>
  )}

  {/* Schedule picker */}
  <Popover>
    <PopoverTrigger
      className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors h-8 px-2 rounded-md hover:bg-background-hover bg-transparent border-0 cursor-pointer"
      aria-label="Set schedule time"
    >
      <CalendarIcon size={14} strokeWidth={1.5} />
      {scheduleDate
        ? `${format(scheduleDate, 'MMM d')} at ${scheduleTime}`
        : 'Schedule'}
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0 bg-background-tertiary border-background-border">
      <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} />
      <div className="px-3 pb-3 border-t border-background-border pt-3">
        <label className="block font-sans text-xs text-text-tertiary mb-1.5">Time</label>
        <input
          type="time"
          value={scheduleTime}
          onChange={(e) => setScheduleTime(e.target.value)}
          className="w-full rounded-lg bg-background-secondary border border-background-border px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-background-border-mid transition-colors"
        />
      </div>
    </PopoverContent>
  </Popover>

  <Button
    variant="ghost"
    size="sm"
    type="button"
    onClick={() => handleSubmit('DRAFT')}
    disabled={isSubmitting || isPostingNow}
    className="text-text-tertiary hover:text-text-primary text-xs"
  >
    Save draft
  </Button>

  <Button
    size="sm"
    type="button"
    onClick={handlePostNow}
    disabled={isPostingNow || isSubmitting}
    className="bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver text-xs gap-2 transition-all duration-150"
  >
    <Zap size={12} strokeWidth={1.5} />
    {isPostingNow ? 'Posting…' : 'Post now'}
  </Button>

  <Button
    size="sm"
    type="button"
    onClick={() => handleSubmit('SCHEDULED')}
    disabled={isSubmitting || isPostingNow || !scheduleDate}
    className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
  >
    <Send size={12} strokeWidth={1.5} />
    {isSubmitting ? 'Scheduling…' : 'Schedule'}
  </Button>
</div>
```

- [ ] **Step 6: Verify TypeScript**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Verify the build**

Run: `cd lyra && npm run build`
Expected: clean build

- [ ] **Step 8: Manual smoke test**

1. Run `npm run dev`
2. Navigate to `/workspace/[id]/compose`
3. Select a platform, type a caption
4. Verify "Post now" button is visible in the toolbar to the left of "Schedule"
5. Click "Post now" — verify toast says "Post published immediately"
6. Navigate to the Calendar — verify the post appears with today's date
7. Confirm the Schedule button still requires a date (click it without selecting date — should be disabled)

- [ ] **Step 9: Commit**

```bash
git add lyra/components/lyra/composer/post-composer.tsx
git commit -m "feat: add Post Now button to compose toolbar"
```
