# Crisis Aware — Email Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send an email to a workspace's owner/admin users when Crisis Aware triggers, via Resend, with a short excerpt of the triggering comment and a link into the Inbox.

**Architecture:** A thin Resend client singleton (`lib/resend.ts`, mirroring the existing `lib/anthropic.ts` pattern), and a pure/impure split in `services/notifications/crisis-alert-email.ts` — a pure function builds the subject/HTML (testable without mocking Resend or Prisma), an impure function does the DB queries and actual send. Called from `checkAndTriggerCrisis()` in `services/ai/crisis-detector.ts`, the single shared call site both the polling cron and the real-time webhook already use.

**Tech Stack:** Resend (`resend` npm package), Prisma, Vitest for the pure builder's unit tests.

**Spec:** `docs/superpowers/specs/2026-07-23-crisis-aware-email-alert-design.md`

---

### Task 1: Install Resend and add the client singleton

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `lib/resend.ts`

- [ ] **Step 1: Install the package**

```bash
npm install resend
```

- [ ] **Step 2: Create the client singleton**

Create `lib/resend.ts`:

```typescript
import { Resend } from 'resend'

// Mirrors lib/anthropic.ts's pattern -- one shared client instance, no
// per-call instantiation. RESEND_API_KEY is already set in the environment
// (confirmed via `netlify env:list`); the `resend` package and this client
// are new -- nothing in this codebase has ever sent an email before.
export const resend = new Resend(process.env.RESEND_API_KEY)

export const EMAIL_FROM = 'notifications@lyraonline.ai'
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/resend.ts
git commit -m "feat: add Resend client for transactional email"
```

---

### Task 2: Pure email-content builder, with tests (TDD)

**Files:**
- Create: `services/notifications/crisis-alert-email.ts`
- Create: `services/notifications/crisis-alert-email.test.ts`

The one piece of real logic here — building the subject and HTML body from trigger data — is pure (no I/O) and worth testing before the Resend-calling half is added in Task 3. This also covers a real correctness concern: the triggering comment's content is hostile, adversarial, user-supplied text by definition (that's *why* it triggered a crisis) — it must be HTML-escaped before being embedded in the email body, or it risks breaking the email's rendering or, worse, being a genuine HTML-injection vector in whatever client renders it.

- [ ] **Step 1: Write the failing tests**

Create `services/notifications/crisis-alert-email.test.ts`:

```typescript
// services/notifications/crisis-alert-email.test.ts
import { describe, it, expect } from 'vitest'
import { buildCrisisAlertEmail } from './crisis-alert-email'

const BASE_PARAMS = {
  workspaceName: 'Into The Wild Marketing',
  workspaceId: 'ws_123',
  triggerType: 'KEYWORD_MATCH' as const,
  comment: {
    content: 'Considering a lawsuit over how this was handled.',
    authorName: 'Jane Doe',
    platform: 'FACEBOOK',
  },
  appBaseUrl: 'https://lyraonline.ai',
}

describe('buildCrisisAlertEmail', () => {
  it('includes the workspace name in the subject', () => {
    const { subject } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(subject).toBe('Crisis Aware alert — Into The Wild Marketing')
  })

  it('describes a keyword match trigger in plain language', () => {
    const { html } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(html).toContain('matched an escalation keyword')
  })

  it('describes a sentiment spike trigger in plain language', () => {
    const { html } = buildCrisisAlertEmail({ ...BASE_PARAMS, triggerType: 'SENTIMENT_SPIKE' })
    expect(html).toContain('negative comments')
  })

  it('includes the comment excerpt, author, and platform', () => {
    const { html } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(html).toContain('Considering a lawsuit over how this was handled.')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('Facebook')
  })

  it('truncates a long comment to roughly 150 characters', () => {
    const longContent = 'x'.repeat(300)
    const { html } = buildCrisisAlertEmail({
      ...BASE_PARAMS,
      comment: { ...BASE_PARAMS.comment, content: longContent },
    })
    expect(html).toContain('x'.repeat(150))
    expect(html).not.toContain('x'.repeat(151))
  })

  it('HTML-escapes comment content to prevent injection', () => {
    const { html } = buildCrisisAlertEmail({
      ...BASE_PARAMS,
      comment: { ...BASE_PARAMS.comment, content: '<script>alert(1)</script>' },
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('includes a link to the workspace inbox using the given base URL', () => {
    const { html } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(html).toContain('https://lyraonline.ai/workspace/ws_123/inbox')
  })

  it('builds without a comment excerpt when none is available', () => {
    const { html } = buildCrisisAlertEmail({ ...BASE_PARAMS, comment: null })
    expect(html).toContain('https://lyraonline.ai/workspace/ws_123/inbox')
    expect(html).not.toContain('undefined')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run services/notifications/crisis-alert-email.test.ts`
Expected: FAIL — `crisis-alert-email.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `services/notifications/crisis-alert-email.ts`:

```typescript
export interface CrisisAlertEmailComment {
  content:     string
  authorName:  string
  platform:    string
}

export interface CrisisAlertEmailParams {
  workspaceName: string
  workspaceId:   string
  triggerType:   'KEYWORD_MATCH' | 'SENTIMENT_SPIKE'
  comment:       CrisisAlertEmailComment | null
  appBaseUrl:    string
}

const PLATFORM_NAMES: Record<string, string> = {
  FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok', TWITTER: 'X', GOOGLE_BUSINESS: 'Google Business',
  YOUTUBE: 'YouTube', PINTEREST: 'Pinterest', THREADS: 'Threads', BLUESKY: 'Bluesky',
}

const TRIGGER_DESCRIPTIONS: Record<CrisisAlertEmailParams['triggerType'], string> = {
  KEYWORD_MATCH:   'A comment matched an escalation keyword.',
  SENTIMENT_SPIKE: 'Multiple genuinely negative comments were detected in a short window.',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

export function buildCrisisAlertEmail(
  params: CrisisAlertEmailParams
): { subject: string; html: string } {
  const { workspaceName, workspaceId, triggerType, comment, appBaseUrl } = params
  const inboxUrl = `${appBaseUrl}/workspace/${workspaceId}/inbox`

  const excerptBlock = comment
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background: #f5f5f5; border-radius: 8px;">
        <tr>
          <td style="padding: 16px 20px;">
            <p style="margin: 0 0 6px; font-size: 13px; color: #666666;">
              ${escapeHtml(comment.authorName)} · ${escapeHtml(PLATFORM_NAMES[comment.platform] ?? comment.platform)}
            </p>
            <p style="margin: 0; font-size: 14px; color: #111111; line-height: 1.5;">
              "${escapeHtml(truncate(comment.content, 150))}${comment.content.length > 150 ? '…' : ''}"
            </p>
          </td>
        </tr>
      </table>
    `
    : ''

  const html = `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111111;">
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #dc2626;">
        Crisis Aware Alert
      </p>
      <h1 style="margin: 0 0 16px; font-size: 20px; color: #111111;">
        ${escapeHtml(workspaceName)}
      </h1>
      <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #333333;">
        ${TRIGGER_DESCRIPTIONS[triggerType]}
      </p>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #333333;">
        Scheduled posts for this workspace are paused until this is resolved in LYRA.
      </p>
      ${excerptBlock}
      <a href="${inboxUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #111111; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
        Review in Inbox
      </a>
    </div>
  `

  return {
    subject: `Crisis Aware alert — ${workspaceName}`,
    html,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run services/notifications/crisis-alert-email.test.ts`
Expected: PASS, 8/8

- [ ] **Step 5: Commit**

```bash
git add services/notifications/crisis-alert-email.ts services/notifications/crisis-alert-email.test.ts
git commit -m "feat: add pure crisis alert email content builder"
```

---

### Task 3: `sendCrisisAlertEmail` — fetch data and send via Resend

**Files:**
- Modify: `services/notifications/crisis-alert-email.ts`

Adds to the same file from Task 2 — the network/DB-calling half. No test for this one, matching this codebase's established convention (pure logic gets unit-tested; the network-calling wrapper around it is exercised live — see `services/brand-intelligence/crisis-keyword-suggester.ts`'s identical split from earlier the same day).

**Before writing this step:** confirm the installed `resend` package's actual `emails.send()` return shape (check its TypeScript types in `node_modules/resend`, or the package's own docs) rather than trusting this plan blindly — the code below assumes it resolves to `{ data, error }` rather than throwing on an API-level failure, which is Resend's documented behavior, but SDK versions can shift. If it's different, adapt the error-checking accordingly and note the deviation in your report.

- [ ] **Step 1: Add the function**

Add these imports at the top of `services/notifications/crisis-alert-email.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { resend, EMAIL_FROM } from '@/lib/resend'
```

Append this function at the end of the file:

```typescript
export async function sendCrisisAlertEmail(
  workspaceId: string,
  triggerType: 'KEYWORD_MATCH' | 'SENTIMENT_SPIKE',
  commentIds: string[]
): Promise<void> {
  try {
    const [workspace, owners, comment] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
      prisma.workspaceAccess.findMany({
        where: { workspaceId, role: { in: ['SMB_OWNER', 'AGENCY_ADMIN'] } },
        select: { user: { select: { email: true } } },
      }),
      commentIds[0]
        ? prisma.comment.findUnique({
            where:  { id: commentIds[0] },
            select: { content: true, authorName: true, socialAccount: { select: { platform: true } } },
          })
        : Promise.resolve(null),
    ])

    if (!workspace) {
      console.error(`Crisis alert email: workspace ${workspaceId} not found`)
      return
    }

    if (owners.length === 0) {
      console.log(`Crisis alert email: no owner/admin recipients for workspace ${workspaceId}`)
      return
    }

    const { subject, html } = buildCrisisAlertEmail({
      workspaceName: workspace.name,
      workspaceId,
      triggerType,
      comment: comment
        ? { content: comment.content, authorName: comment.authorName, platform: comment.socialAccount.platform }
        : null,
      appBaseUrl: process.env.APP_BASE_URL!,
    })

    // Resend's SDK does not throw on an API-level failure (invalid recipient,
    // domain/sending issues, etc.) -- it resolves with { data, error }. Without
    // explicitly checking `error`, a real failure would silently look like
    // success to this function's own try/catch, defeating the point of even
    // logging failures. Still never throws past this point -- fail-open stays
    // intact -- but a real failure is now actually visible in logs.
    const results = await Promise.all(
      owners.map((o) =>
        resend.emails.send({
          from:    EMAIL_FROM,
          to:      o.user.email,
          subject,
          html,
        })
      )
    )

    const failures = results.filter((r) => r.error)
    if (failures.length > 0) {
      console.error(`Crisis alert email: ${failures.length}/${owners.length} sends failed for workspace ${workspaceId}:`, failures.map((f) => f.error))
    }
    const sentCount = owners.length - failures.length
    if (sentCount > 0) {
      console.log(`Crisis alert email sent to ${sentCount}/${owners.length} recipient(s) for workspace ${workspaceId}`)
    }
  } catch (error) {
    // Fail open -- an email failure must never affect crisis detection itself.
    // crisisActive and the CrisisEvent are already recorded by the caller
    // before this function is ever invoked.
    console.error(`Crisis alert email failed for workspace ${workspaceId}:`, error)
  }
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add services/notifications/crisis-alert-email.ts
git commit -m "feat: add sendCrisisAlertEmail (fetches recipients + sends via Resend)"
```

---

### Task 4: Wire into Crisis Aware detection, and close a concurrent-trigger race while we're in this function

**Files:**
- Modify: `services/ai/crisis-detector.ts`

**Scope note:** this task grew during Task 3's code review. `checkAndTriggerCrisis` already has a pre-existing race, unrelated to email: it reads `crisisActive` in one round-trip, then unconditionally sets it `true` in a later transaction. Two concurrent callers (the real-time webhook and the polling cron, or two overlapping webhook deliveries) can both pass the initial check before either commits, both flip `crisisActive`, both create a `CrisisEvent`. This was always possible, but silent — a duplicate DB row nobody would likely notice. Adding email on top makes the consequence visible: a duplicate crisis alert email to the workspace owner. Since the fix touches the exact lines this task already modifies, it's folded in here rather than filed as separate follow-up work discovered after the fact.

- [ ] **Step 1: Add the import**

At the top of `services/ai/crisis-detector.ts`, add:

```typescript
import { sendCrisisAlertEmail } from '@/services/notifications/crisis-alert-email'
```

- [ ] **Step 2: Replace the unconditional update with a compare-and-set, and call the email function only on the winning side**

In `checkAndTriggerCrisis`, find:

```typescript
    if (result.triggered) {
      await prisma.$transaction([
        prisma.workspace.update({
          where: { id: workspaceId },
          data: { crisisActive: true, crisisTriggeredAt: new Date() },
        }),
        prisma.crisisEvent.create({
          data: {
            workspaceId,
            triggerType: result.type,
            commentIds:  result.commentIds,
          },
        }),
      ])
      console.log(`Crisis triggered for workspace ${workspaceId}: ${result.type}`)
    }
```

Replace with:

```typescript
    if (result.triggered) {
      // Compare-and-set, not a blind update: the check above and this
      // transaction are two separate round-trips, so two concurrent callers
      // (the webhook and the polling cron, or two overlapping webhook
      // deliveries) can both pass the check before either commits here. The
      // `crisisActive: false` in the WHERE clause makes the update itself the
      // atomic decision point -- Postgres row locking during the UPDATE
      // ensures only one concurrent transaction can flip false -> true.
      // Only the winner (count === 1) records the event and sends the email;
      // the loser sees count === 0 (crisisActive was already true by the
      // time its update ran) and quietly backs off -- there is nothing left
      // for it to do, the crisis is already recorded.
      const won = await prisma.$transaction(async (tx) => {
        const { count } = await tx.workspace.updateMany({
          where: { id: workspaceId, crisisActive: false },
          data:  { crisisActive: true, crisisTriggeredAt: new Date() },
        })
        if (count === 0) return false
        await tx.crisisEvent.create({
          data: {
            workspaceId,
            triggerType: result.type,
            commentIds:  result.commentIds,
          },
        })
        return true
      })

      if (won) {
        console.log(`Crisis triggered for workspace ${workspaceId}: ${result.type}`)
        await sendCrisisAlertEmail(workspaceId, result.type, result.commentIds)
      }
    }
```

Note: `sendCrisisAlertEmail` already has its own internal try/catch and never throws, so this `await` cannot cause the outer `checkAndTriggerCrisis` catch block to fire because of an email problem — but it's still inside the same function's existing try, consistent with everything else here already being fail-open at multiple layers.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add services/ai/crisis-detector.ts
git commit -m "feat: send an email alert when Crisis Aware triggers"
```

---

### Task 5: Manual verification and Testing Checklist entry

**Files:**
- Modify: `docs/LYRA-Testing-Checklist.md`

- [ ] **Step 1: Live verification**

1. On a workspace with Crisis Aware on and at least one `ALWAYS_ESCALATE` guardrail keyword configured, leave a comment containing that keyword (same test setup as the original Crisis Aware keyword-match test earlier this session).
2. Wait for the trigger (webhook, near-instant, or the polling cron within ~5 minutes).
3. Confirm the crisis banner appears in-app as before.
4. Confirm an email arrives at the workspace owner/admin's address, from `notifications@lyraonline.ai`, with the workspace name in the subject, the triggering comment's excerpt, and a working link to that workspace's Inbox.
5. Click Resolve on the in-app banner. Confirm no second email is sent for the same crisis episode (matches existing `crisisActive` short-circuit behavior).
6. Trigger a second, separate crisis afterward and confirm a new email does go out for the new episode.

- [ ] **Step 2: Update the Testing Checklist**

In `docs/LYRA-Testing-Checklist.md`, under the `## Ongoing / lower priority, as time allows` section, add:

```markdown
- [ ] Crisis Aware email alert (shipped 23 Jul 2026, not yet tested live) — trigger a crisis, confirm an email arrives at the workspace owner/admin's address with the workspace name, triggering comment excerpt, and a working Inbox link; confirm no duplicate email on the same open crisis; confirm a fresh email on a subsequent separate crisis
```

- [ ] **Step 3: Commit**

```bash
git add docs/LYRA-Testing-Checklist.md
git commit -m "docs: add Crisis Aware email alert to the testing checklist"
```
