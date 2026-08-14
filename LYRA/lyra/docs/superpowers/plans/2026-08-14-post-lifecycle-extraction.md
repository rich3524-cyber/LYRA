# Post-Lifecycle Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the 4 independently-drifting copies of post approval/status-transition logic into one pure decision module + one server-only bookkeeping module, per `docs/superpowers/specs/2026-08-14-post-lifecycle-extraction-design.md`.

**Architecture:** Two new files in `services/posts/` — `post-lifecycle.ts` (pure, zero runtime deps, safe for both server and `'use client'` code) and `post-approval-bookkeeping.ts` (server-only, imports `prisma`). Four existing files migrate to call these instead of their own inline duplicated logic, with zero behavior change except one intentional UX fix in the frontend.

**Tech Stack:** Next.js 16 App Router, Prisma, Vitest, TypeScript.

**Corrections made during planning (re-verified against current code, not assumed from the spec):**
- `resolveApprovalTransition`'s `requestedStatus` must accept `PostStatus | undefined` and may return `undefined` — the PATCH route's `status` field is optional (a caller can PATCH only `content` without touching `status`), and the current code's final fallback (`: status`) preserves that `undefined` all the way through. The spec's sketch used a non-optional `PostStatus`; this plan fixes that.
- The DRAFT-case UX fix in `post-detail-panel.tsx` does NOT need to call `resolveApprovalTransition` for the "would this redirect to PENDING_APPROVAL" check to be *correct* — algebraically, for `existingStatus: 'DRAFT'`, `resolveApprovalTransition`'s answer to "would SCHEDULED become PENDING_APPROVAL" always reduces to exactly `clientAccessLevel === 'APPROVE'` (the `isApprovingReadyPost` shortcut requires `requestedStatus === 'APPROVED'`, and the content-changed exemption requires `existingStatus === 'APPROVED'` — neither applies to a DRAFT post being scheduled). Task 6 still calls the shared function anyway (rather than hardcoding that boolean) so a *future* change to `resolveApprovalTransition`'s rules is automatically inherited here instead of silently drifting again — that automatic-inheritance property is the entire point of this extraction.

---

### Task 1: `services/posts/post-lifecycle.ts` — pure decision module

**Files:**
- Create: `services/posts/post-lifecycle.ts`
- Test: `services/posts/post-lifecycle.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// services/posts/post-lifecycle.test.ts
import { describe, it, expect } from 'vitest'
import { resolveCreateStatus, canSelfApprove, resolveApprovalTransition } from './post-lifecycle'

describe('resolveCreateStatus', () => {
  it('routes a SCHEDULED request to PENDING_APPROVAL when the workspace requires client approval', () => {
    expect(resolveCreateStatus('SCHEDULED', 'APPROVE')).toBe('PENDING_APPROVAL')
  })

  it('leaves a SCHEDULED request unchanged when the workspace does not require client approval', () => {
    expect(resolveCreateStatus('SCHEDULED', 'NONE')).toBe('SCHEDULED')
  })

  it('never redirects a DRAFT request regardless of clientAccessLevel', () => {
    expect(resolveCreateStatus('DRAFT', 'APPROVE')).toBe('DRAFT')
  })
})

describe('canSelfApprove', () => {
  it('allows approval when the viewer did not author the post, regardless of other approvers', () => {
    expect(canSelfApprove({ isAuthor: false, hasOtherApprover: true })).toBe(true)
    expect(canSelfApprove({ isAuthor: false, hasOtherApprover: false })).toBe(true)
  })

  it('blocks self-approval when the viewer authored the post and another approver-capable member exists', () => {
    expect(canSelfApprove({ isAuthor: true, hasOtherApprover: true })).toBe(false)
  })

  it('allows self-approval when the viewer authored the post and no other approver-capable member exists', () => {
    expect(canSelfApprove({ isAuthor: true, hasOtherApprover: false })).toBe(true)
  })
})

describe('resolveApprovalTransition', () => {
  it('jumps straight to SCHEDULED when approving a post whose media and schedule are both already ready', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'APPROVED', existingStatus: 'PENDING_APPROVAL', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('SCHEDULED')
  })

  it('stays at APPROVED when media is still required and missing', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'APPROVED', existingStatus: 'PENDING_APPROVAL', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: false, hasScheduledAt: true,
    })).toBe('APPROVED')
  })

  it('stays at APPROVED when there is no scheduledAt yet, even if media is ready', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'APPROVED', existingStatus: 'PENDING_APPROVAL', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: false,
    })).toBe('APPROVED')
  })

  it('redirects a SCHEDULED request from DRAFT to PENDING_APPROVAL when the workspace requires client approval', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'DRAFT', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('PENDING_APPROVAL')
  })

  it('leaves a SCHEDULED request unchanged when the workspace does not require client approval', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'DRAFT', clientAccessLevel: 'NONE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('SCHEDULED')
  })

  it('exempts an already-APPROVED post with unchanged content from being redirected back to PENDING_APPROVAL', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'APPROVED', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('SCHEDULED')
  })

  it('bypass fix: redirects an APPROVED post with CHANGED content back to PENDING_APPROVAL for re-review', () => {
    expect(resolveApprovalTransition({
      requestedStatus: 'SCHEDULED', existingStatus: 'APPROVED', clientAccessLevel: 'APPROVE',
      contentChanged: true, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBe('PENDING_APPROVAL')
  })

  it('passes through an undefined requestedStatus unchanged (a PATCH that does not touch status)', () => {
    expect(resolveApprovalTransition({
      requestedStatus: undefined, existingStatus: 'DRAFT', clientAccessLevel: 'APPROVE',
      contentChanged: false, hasMediaIfRequired: true, hasScheduledAt: true,
    })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run services/posts/post-lifecycle.test.ts`
Expected: FAIL — `Cannot find module './post-lifecycle'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// services/posts/post-lifecycle.ts
//
// Pure, framework-agnostic post-lifecycle decisions -- the single owner of
// logic previously duplicated across app/api/posts/[id]/route.ts (PATCH),
// app/api/posts/route.ts (POST), app/api/workspaces/[id]/bulk-import/commit/route.ts,
// and components/lyra/calendar/post-detail-panel.tsx's getNextStatuses. See
// docs/superpowers/specs/2026-08-14-post-lifecycle-extraction-design.md.
//
// Every export here is a pure function -- no I/O, no Prisma runtime import
// (only type-only imports, which erase at compile time) -- so this file is
// safe to import from a 'use client' component with zero risk of pulling
// @prisma/client's runtime into a browser bundle.
import type { PostStatus, ClientAccessLevel } from '@prisma/client'

export function resolveCreateStatus(
  requestedStatus: PostStatus,
  clientAccessLevel: ClientAccessLevel
): PostStatus {
  return requestedStatus === 'SCHEDULED' && clientAccessLevel === 'APPROVE'
    ? 'PENDING_APPROVAL'
    : requestedStatus
}

export function canSelfApprove(input: { isAuthor: boolean; hasOtherApprover: boolean }): boolean {
  return !input.isAuthor || !input.hasOtherApprover
}

export interface ResolveApprovalTransitionInput {
  requestedStatus: PostStatus | undefined
  existingStatus: PostStatus
  clientAccessLevel: ClientAccessLevel
  contentChanged: boolean
  hasMediaIfRequired: boolean
  hasScheduledAt: boolean
}

export function resolveApprovalTransition(input: ResolveApprovalTransitionInput): PostStatus | undefined {
  const {
    requestedStatus, existingStatus, clientAccessLevel,
    contentChanged, hasMediaIfRequired, hasScheduledAt,
  } = input

  // Approving no longer leaves the post sitting in APPROVED waiting for a
  // separate "Schedule post" click -- if media/schedule requirements are
  // already satisfied, the approval itself is the last gate.
  const isApprovingReadyPost =
    requestedStatus === 'APPROVED' && hasMediaIfRequired && hasScheduledAt
  if (isApprovingReadyPost) return 'SCHEDULED'

  // A SCHEDULED request under an approval workflow is redirected to
  // PENDING_APPROVAL, EXCEPT for the one legitimate route out of the
  // approval flow: an already-APPROVED post whose content hasn't changed
  // since approval. A content change forces re-review same as any other
  // non-approved post -- see the bypass-fix test above.
  const needsReview =
    requestedStatus === 'SCHEDULED' &&
    clientAccessLevel === 'APPROVE' &&
    !(existingStatus === 'APPROVED' && !contentChanged)
  if (needsReview) return 'PENDING_APPROVAL'

  return requestedStatus
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run services/posts/post-lifecycle.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add services/posts/post-lifecycle.ts services/posts/post-lifecycle.test.ts
git commit -m "feat: add pure post-lifecycle decision module"
```

---

### Task 2: `services/posts/post-approval-bookkeeping.ts` — server-only bookkeeping module

**Files:**
- Create: `services/posts/post-approval-bookkeeping.ts`
- Test: `services/posts/post-approval-bookkeeping.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// services/posts/post-approval-bookkeeping.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { postApproval: { upsert: vi.fn() } },
}))
vi.mock('@/services/notifications/channel-notifier', () => ({ notifyChannel: vi.fn() }))
vi.mock('@/lib/platform-labels', () => ({ getPlatformLabel: (p: string) => p }))

import { prisma } from '@/lib/prisma'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { buildApprovalCreateInput, upsertApprovalOnTransition } from './post-approval-bookkeeping'

describe('buildApprovalCreateInput', () => {
  it('returns a nested PostApproval create when landing in PENDING_APPROVAL', () => {
    const submittedAt = new Date('2026-08-14T00:00:00.000Z')
    expect(buildApprovalCreateInput('PENDING_APPROVAL', submittedAt)).toEqual({
      approval: { create: { status: 'PENDING', submittedAt } },
    })
  })

  it('returns an empty object for any other status', () => {
    expect(buildApprovalCreateInput('SCHEDULED', new Date())).toEqual({})
    expect(buildApprovalCreateInput('DRAFT', new Date())).toEqual({})
  })
})

describe('upsertApprovalOnTransition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts PENDING with a fresh submittedAt and notifies the workspace channel when landing in PENDING_APPROVAL', async () => {
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)
    const scheduledAt = new Date('2026-09-01T00:00:00.000Z')

    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'PENDING_APPROVAL', requestedStatus: 'SCHEDULED',
      existingStatus: 'DRAFT', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt, authorName: 'Jane',
    })

    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'PENDING', submittedAt: expect.any(Date) },
        update: {
          status: 'PENDING', reviewedAt: null, reviewerId: null,
          submittedAt: expect.any(Date), slaAlertedAt: null,
        },
      })
    )
    expect(notifyChannel).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        event: 'POST_PENDING_APPROVAL', workspaceName: 'Acme', platform: 'FACEBOOK',
        excerpt: 'hello', scheduledAt, authorName: 'Jane',
      }),
      expect.objectContaining({ dedupeKey: expect.stringContaining('pending-post-1-') })
    )
  })

  it('upserts APPROVED bookkeeping when the requested status is APPROVED, even if finalStatus jumped to SCHEDULED', async () => {
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'SCHEDULED', requestedStatus: 'APPROVED',
      existingStatus: 'PENDING_APPROVAL', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
        update: { status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
      })
    )
    expect(notifyChannel).not.toHaveBeenCalled()
  })

  it('upserts REJECTED bookkeeping on a recall from PENDING_APPROVAL back to DRAFT', async () => {
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'DRAFT', requestedStatus: 'DRAFT',
      existingStatus: 'PENDING_APPROVAL', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'REJECTED', reviewedAt: expect.any(Date) },
        update: { status: 'REJECTED', reviewedAt: expect.any(Date) },
      })
    )
  })

  it('does nothing when a DRAFT->DRAFT no-op transition does not come from PENDING_APPROVAL', async () => {
    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'DRAFT', requestedStatus: 'DRAFT',
      existingStatus: 'DRAFT', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).not.toHaveBeenCalled()
  })

  it('does nothing for an ordinary SCHEDULED transition outside any approval flow', async () => {
    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'SCHEDULED', requestedStatus: 'SCHEDULED',
      existingStatus: 'DRAFT', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run services/posts/post-approval-bookkeeping.test.ts`
Expected: FAIL — `Cannot find module './post-approval-bookkeeping'`

- [ ] **Step 3: Write the implementation**

```typescript
// services/posts/post-approval-bookkeeping.ts
//
// Server-only. Owns the PostApproval record read/write shapes previously
// duplicated across app/api/posts/[id]/route.ts (PATCH), app/api/posts/route.ts
// (POST), and app/api/workspaces/[id]/bulk-import/commit/route.ts -- the
// duplication that caused the same missing-approval-row bug to be fixed twice
// independently. See docs/superpowers/specs/2026-08-14-post-lifecycle-extraction-design.md.
//
// Deliberately NOT in post-lifecycle.ts: ApprovalStatus is a runtime import
// from @prisma/client (not type-only), and this module calls prisma directly
// -- bundling either into a 'use client' component would be a real risk this
// split avoids entirely.
import { ApprovalStatus, type PostStatus, type Platform } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { getPlatformLabel } from '@/lib/platform-labels'

export function buildApprovalCreateInput(finalStatus: PostStatus, submittedAt: Date) {
  return finalStatus === 'PENDING_APPROVAL'
    ? { approval: { create: { status: ApprovalStatus.PENDING, submittedAt } } }
    : {}
}

export interface UpsertApprovalOnTransitionInput {
  postId: string
  finalStatus: PostStatus | undefined
  requestedStatus: PostStatus | undefined
  existingStatus: PostStatus
  reviewerId: string
  workspaceId: string
  workspaceName: string
  platform: Platform
  excerpt: string
  scheduledAt: Date | null
  authorName: string | null
}

export async function upsertApprovalOnTransition(input: UpsertApprovalOnTransitionInput): Promise<void> {
  const {
    postId, finalStatus, requestedStatus, existingStatus, reviewerId,
    workspaceId, workspaceName, platform, excerpt, scheduledAt, authorName,
  } = input

  // Branches key off finalStatus (what was actually written) for the
  // PENDING_APPROVAL/DRAFT cases, matching the route's own comment: a
  // SCHEDULED request redirected to PENDING_APPROVAL still needs a reviewable
  // PostApproval record.
  if (finalStatus === 'PENDING_APPROVAL') {
    // submittedAt starts the SLA clock for THIS pending cycle, and
    // slaAlertedAt is cleared so a resubmitted post can alert again. Neither
    // can key off createdAt: this row is upserted, so on a resubmit the
    // update branch runs and createdAt still holds the first ever submission.
    const submittedAt = new Date()
    await prisma.postApproval.upsert({
      where:  { postId },
      create: { postId, status: 'PENDING', submittedAt },
      update: { status: 'PENDING', reviewedAt: null, reviewerId: null, submittedAt, slaAlertedAt: null },
    })

    // Fire-and-forget by design -- notifyChannel never throws, and an alert
    // problem must not fail a real approval submission.
    await notifyChannel(
      workspaceId,
      {
        event: 'POST_PENDING_APPROVAL',
        workspaceName,
        platform: getPlatformLabel(platform),
        excerpt,
        scheduledAt,
        authorName,
      },
      // Keyed on the submission instant, so a resubmit is a genuinely new
      // alert while a double-click on Submit is not.
      { dedupeKey: `pending-${postId}-${submittedAt.getTime()}` }
    )
  } else if (requestedStatus === 'APPROVED') {
    // An approval decision happened, regardless of whether the post landed
    // on APPROVED (still awaiting media) or jumped straight to SCHEDULED --
    // checks the RAW requested status, not finalStatus, deliberately.
    await prisma.postApproval.upsert({
      where:  { postId },
      create: { postId, status: 'APPROVED', reviewerId, reviewedAt: new Date() },
      update: { status: 'APPROVED', reviewerId, reviewedAt: new Date() },
    })
  } else if (finalStatus === 'DRAFT' && existingStatus === 'PENDING_APPROVAL') {
    await prisma.postApproval.upsert({
      where:  { postId },
      create: { postId, status: 'REJECTED', reviewedAt: new Date() },
      update: { status: 'REJECTED', reviewedAt: new Date() },
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run services/posts/post-approval-bookkeeping.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add services/posts/post-approval-bookkeeping.ts services/posts/post-approval-bookkeeping.test.ts
git commit -m "feat: add server-only post-approval bookkeeping module"
```

---

### Task 3: Migrate `app/api/posts/[id]/route.ts` (PATCH) — copy #1

**Files:**
- Modify: `app/api/posts/[id]/route.ts`
- Modify: `app/api/posts/[id]/route.test.ts` (no assertion changes expected — this task must not change behavior; run as a characterization check)

- [ ] **Step 1: Update the imports**

Replace the import block at the top of `app/api/posts/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PostStatus } from '@prisma/client'
import { parseBody, ValidationError } from '@/lib/validate'
import { checkMediaCompatibility, formatCompatibilityIssue } from '@/services/social/media-compatibility'
import { APPROVER_ROLES } from '@/lib/authz'
import { canSelfApprove, resolveApprovalTransition } from '@/services/posts/post-lifecycle'
import { upsertApprovalOnTransition } from '@/services/posts/post-approval-bookkeeping'
```

(Removes the now-unused `getPlatformLabel` and `notifyChannel` imports — both moved inside `post-approval-bookkeeping.ts`.)

- [ ] **Step 2: Replace the self-approval check to use `canSelfApprove`**

Replace lines 79-102 (the `if (status === 'APPROVED')` block):

```typescript
    if (status === 'APPROVED') {
      const access = await prisma.workspaceAccess.findFirst({
        where:  { workspaceId: existing.workspaceId, userId: user.id },
        select: { role: true },
      })
      if (!access || !APPROVER_ROLES.includes(access.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (user.id === existing.authorId) {
        const otherApprover = await prisma.workspaceAccess.findFirst({
          where: {
            workspaceId: existing.workspaceId,
            userId: { not: user.id },
            // Spread into a plain mutable array -- Prisma's generated
            // EnumUserRoleFilter.in expects UserRole[], and APPROVER_ROLES is
            // typed readonly UserRole[] (deliberately, see lib/authz.ts).
            role: { in: [...APPROVER_ROLES] },
          },
        })
        if (!canSelfApprove({ isAuthor: true, hasOtherApprover: !!otherApprover })) {
          return NextResponse.json({ error: 'Cannot approve your own post' }, { status: 403 })
        }
      }
    }
```

- [ ] **Step 3: Replace the `finalStatus` computation to use `resolveApprovalTransition`**

Replace lines 127-151 (from `const contentChanged =` through the `finalStatus` ternary):

```typescript
    const contentChanged =
      (content !== undefined && content !== existing.content) ||
      (mediaUrls !== undefined && mediaUrls.join('\u0000') !== existing.mediaUrls.join('\u0000'))

    const effectiveMediaUrls = mediaUrls ?? existing.mediaUrls
    const hasMediaIfRequired = !(existing.requiresMedia && effectiveMediaUrls.length === 0)

    const finalStatus = resolveApprovalTransition({
      requestedStatus:    status,
      existingStatus:     existing.status,
      clientAccessLevel:  existing.workspace.clientAccessLevel,
      contentChanged,
      hasMediaIfRequired,
      hasScheduledAt:     existing.scheduledAt !== null,
    })
```

- [ ] **Step 4: Replace the `PostApproval` bookkeeping block with a call to `upsertApprovalOnTransition`**

Replace lines 172-220 (the `// Manage PostApproval record...` comment through the closing `}` of the if/else-if chain):

```typescript
    // Manage PostApproval record on approval-related status transitions.
    await upsertApprovalOnTransition({
      postId:            id,
      finalStatus,
      requestedStatus:   status,
      existingStatus:    existing.status,
      reviewerId:        user.id,
      workspaceId:       existing.workspaceId,
      workspaceName:     existing.workspace.name,
      platform:          existing.socialAccount.platform,
      excerpt:           content ?? existing.content,
      scheduledAt:       scheduledAt !== undefined
        ? (scheduledAt ? new Date(scheduledAt) : null)
        : existing.scheduledAt,
      authorName:        existing.author?.name ?? null,
    })
```

- [ ] **Step 5: Run the existing test suite for this route to confirm zero behavior change**

Run: `npx vitest run "app/api/posts/[id]/route.test.ts"`
Expected: PASS, all 20 existing tests, with NO assertion changes made in this task.

- [ ] **Step 6: Commit**

```bash
git add "app/api/posts/[id]/route.ts"
git commit -m "refactor: migrate PATCH /api/posts/[id] to shared post-lifecycle module"
```

---

### Task 4: Migrate `app/api/posts/route.ts` (POST) — copy #2

**Files:**
- Modify: `app/api/posts/route.ts`
- Modify: `app/api/posts/route.test.ts` (no assertion changes expected)

- [ ] **Step 1: Add the import**

Add to the import block at the top of `app/api/posts/route.ts`:

```typescript
import { resolveCreateStatus } from '@/services/posts/post-lifecycle'
import { buildApprovalCreateInput } from '@/services/posts/post-approval-bookkeeping'
```

- [ ] **Step 2: Replace the `finalStatus` ternary**

Replace lines 171-180:

```typescript
    // Post publishing/scheduling routes through the client approval workflow
    // where it's enabled (parent MCP spec 3.4). A general fix, not
    // MCP-specific -- the same gap existed for the web app, previously
    // papered over by the UI (components/lyra/calendar/*) only ever
    // offering the "correct" status transition to a thoughtful human;
    // nothing server-side enforced it.
    const finalStatus = resolveCreateStatus(resolvedStatus, access.workspace.clientAccessLevel)
```

- [ ] **Step 3: Replace the `approvalCreate` block**

Replace lines 196-208 (the `// A post created straight into PENDING_APPROVAL...` comment through the `approvalCreate` assignment):

```typescript
    // A post created straight into PENDING_APPROVAL needs its PostApproval row
    // here. PATCH /api/posts/[id] creates one on the "Submit for approval"
    // transition, but nothing did for a post that lands in approval at
    // creation time -- and the SLA cron filters on the related approval row,
    // so those posts were invisible to approval-overdue alerting entirely.
    const submittedAt = new Date()
    const approvalCreate = buildApprovalCreateInput(finalStatus, submittedAt)
```

- [ ] **Step 4: Run the existing test suite for this route to confirm zero behavior change**

Run: `npx vitest run app/api/posts/route.test.ts`
Expected: PASS, all 6 existing tests, with NO assertion changes made in this task.

- [ ] **Step 5: Commit**

```bash
git add app/api/posts/route.ts
git commit -m "refactor: migrate POST /api/posts to shared post-lifecycle module"
```

---

### Task 5: Migrate `app/api/workspaces/[id]/bulk-import/commit/route.ts` — copy #3

**Files:**
- Modify: `app/api/workspaces/[id]/bulk-import/commit/route.ts`
- Modify: `app/api/workspaces/[id]/bulk-import/commit/route.test.ts` (no assertion changes expected)

- [ ] **Step 1: Add the import**

Add to the import block at the top of the file:

```typescript
import { resolveCreateStatus } from '@/services/posts/post-lifecycle'
import { buildApprovalCreateInput } from '@/services/posts/post-approval-bookkeeping'
```

- [ ] **Step 2: Replace the `finalStatus` line**

Replace line 166. This route only ever creates posts as `SCHEDULED` (there is no draft path for a bulk import), so the requested status passed to `resolveCreateStatus` is always the literal `'SCHEDULED'`:

```typescript
    // Same approval-routing rule POST /api/posts already applies -- a bulk
    // import must not bypass client approval just because it arrived as a
    // batch instead of individual composer submissions.
    const finalStatus = resolveCreateStatus('SCHEDULED', access.workspace.clientAccessLevel)
```

- [ ] **Step 3: Replace the `approvalCreate` block**

Replace lines 176-184:

```typescript
    // A post created straight into PENDING_APPROVAL needs its PostApproval row
    // here -- the SLA cron filters on the related approval row, so without one
    // an imported post is invisible to approval-overdue alerting.
    const submittedAt = new Date()
    const approvalCreate = buildApprovalCreateInput(finalStatus, submittedAt)
```

- [ ] **Step 4: Run the existing test suite for this route to confirm zero behavior change**

Run: `npx vitest run "app/api/workspaces/[id]/bulk-import/commit/route.test.ts"`
Expected: PASS, all 16 existing tests, with NO assertion changes made in this task.

- [ ] **Step 5: Commit**

```bash
git add "app/api/workspaces/[id]/bulk-import/commit/route.ts"
git commit -m "refactor: migrate bulk-import commit route to shared post-lifecycle module"
```

---

### Task 6: Migrate `components/lyra/calendar/post-detail-panel.tsx` (`getNextStatuses`) — copy #4, plus the UX fix

**Files:**
- Modify: `components/lyra/calendar/post-detail-panel.tsx`
- Modify: `components/lyra/calendar/post-detail-panel.test.ts`

- [ ] **Step 1: Write the new/changed failing tests first**

The existing DRAFT-case tests (lines 40-53 of the current test file) assert the OLD behavior (`Mark as scheduled` always present). Per the approved UX fix, these two tests change. Replace that `describe('DRAFT', ...)` block:

```typescript
  describe('DRAFT', () => {
    it('offers only "Submit for approval" when the workspace requires client approval — "Mark as scheduled" would silently redirect to it, so it is not shown', () => {
      const options = getNextStatuses('DRAFT', 'AGENCY_ADMIN', 'APPROVE', false)
      expect(options).toEqual([
        { value: 'PENDING_APPROVAL', label: 'Submit for approval' },
      ])
    })

    it('offers only "Mark as scheduled" when the workspace does not require client approval', () => {
      const options = getNextStatuses('DRAFT', 'AGENCY_ADMIN', 'NONE', false)
      expect(options).toEqual([{ value: 'SCHEDULED', label: 'Mark as scheduled' }])
    })
  })
```

All other existing tests in this file (PENDING_APPROVAL, CLIENT_APPROVE, other-statuses, isAwaitingMedia, and the author/hasOtherApprover matrix) must keep passing unchanged.

- [ ] **Step 2: Run tests to verify the two updated DRAFT tests fail against the current implementation**

Run: `npx vitest run components/lyra/calendar/post-detail-panel.test.ts`
Expected: FAIL — the two DRAFT tests fail (current code still returns both options under approval); every other test in the file still passes.

- [ ] **Step 3: Update the imports in `post-detail-panel.tsx`**

Add to the import block at the top of the file:

```typescript
import { canSelfApprove, resolveApprovalTransition } from '@/services/posts/post-lifecycle'
import type { ClientAccessLevel } from '@prisma/client'
```

- [ ] **Step 4: Replace the `isAuthor` self-approval branches to use `canSelfApprove`**

Replace lines 49-67 (from the `const options = (() => {` opening through the third `if` block, keeping the `if (userRole === 'CLIENT_APPROVE') return []` line and the `switch` unchanged for now):

```typescript
  const options = (() => {
    // Mirrors the shared post-lifecycle module's self-approval rule
    // (services/posts/post-lifecycle.ts, also used by
    // app/api/posts/[id]/route.ts): the author can't approve their own post
    // when someone else on the workspace genuinely could, so that case only
    // offers the non-approval action -- no button is shown that's known to
    // fail with 403. When no other approver exists anywhere on the
    // workspace, self-approval is allowed but the label makes explicit that
    // no real second-party review is happening.
    if (status === 'PENDING_APPROVAL' && canApprove && isAuthor) {
      if (!canSelfApprove({ isAuthor, hasOtherApprover })) {
        return [
          { value: 'DRAFT', label: 'Recall for editing' },
        ]
      }
      return [
        { value: 'APPROVED', label: 'Approve (no other reviewer available)', variant: 'approve' as const },
        { value: 'DRAFT',    label: 'Request changes',                      variant: 'reject'  as const },
      ]
    }
    if (status === 'PENDING_APPROVAL' && canApprove) {
      return [
        { value: 'APPROVED', label: 'Approve',         variant: 'approve' as const },
        { value: 'DRAFT',    label: 'Request changes', variant: 'reject'  as const },
      ]
    }
```

- [ ] **Step 5: Replace the `DRAFT` case in the `switch` to drop the redundant option**

Replace the `case 'DRAFT':` block (originally lines 83-87):

```typescript
      case 'DRAFT': {
        // "Mark as scheduled" would silently be redirected server-side to
        // PENDING_APPROVAL whenever the workspace requires client approval
        // (see resolveApprovalTransition) -- showing it alongside "Submit for
        // approval" as if it were a distinct, faster action was misleading.
        // Calling the shared function here (rather than hardcoding
        // hasApprovalFlow directly) means a future change to that rule is
        // inherited automatically instead of silently drifting again.
        // hasScheduledAt/hasMediaIfRequired are hypothetical inputs for "if
        // the viewer clicked this now" -- hasScheduledAt is always assumed
        // true (scheduling sets a time in the same action), and
        // hasMediaIfRequired reflects the real isAwaitingMedia the panel
        // already has.
        const wouldNeedApproval = resolveApprovalTransition({
          requestedStatus:    'SCHEDULED',
          existingStatus:     'DRAFT',
          clientAccessLevel:  clientAccessLevel as ClientAccessLevel,
          contentChanged:     false,
          hasMediaIfRequired: !isAwaitingMedia,
          hasScheduledAt:     true,
        }) === 'PENDING_APPROVAL'

        return [
          ...(hasApprovalFlow ? [{ value: 'PENDING_APPROVAL', label: 'Submit for approval' }] : []),
          ...(wouldNeedApproval ? [] : [{ value: 'SCHEDULED', label: 'Mark as scheduled' }]),
        ]
      }
```

- [ ] **Step 6: Run tests to verify everything passes**

Run: `npx vitest run components/lyra/calendar/post-detail-panel.test.ts`
Expected: PASS, all tests including the 2 updated DRAFT tests.

- [ ] **Step 7: Commit**

```bash
git add components/lyra/calendar/post-detail-panel.tsx components/lyra/calendar/post-detail-panel.test.ts
git commit -m "refactor: migrate getNextStatuses to shared post-lifecycle module, drop misleading Mark-as-scheduled option under approval flow"
```

---

### Task 7: Full-suite characterization run and manual behavior diff

**Files:** none (verification-only task)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: PASS, every test file in the repo — no regressions anywhere outside the 4 migrated files.

- [ ] **Step 2: Run the typechecker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual behavior diff against the spec's "no behavior change except one UX fix" requirement**

Re-read the final state of all 4 migrated files plus the 2 new modules side by side with `docs/superpowers/specs/2026-08-14-post-lifecycle-extraction-design.md`, and confirm:
- `app/api/posts/[id]/route.ts`: self-approval check, `finalStatus` resolution, and `PostApproval` bookkeeping produce byte-identical decisions to the pre-migration code for every case covered by its existing 20 tests (already re-verified in Task 3, Step 5 — this step is a final read-through, not a re-run).
- `app/api/posts/route.ts` and the bulk-import commit route: `finalStatus`/`approvalCreate` shapes unchanged.
- `components/lyra/calendar/post-detail-panel.tsx`: the ONLY behavior change anywhere in this plan is the DRAFT case no longer offering "Mark as scheduled" when `hasApprovalFlow` is true.

- [ ] **Step 4: Push the branch and open a PR**

This repo's `main` branch requires a passing PR to merge (branch protection, added 2026-08-14) — do not push directly to `main`.

```bash
git checkout -b refactor/post-lifecycle-extraction
git push -u origin refactor/post-lifecycle-extraction
```

Then use `gh pr create` (gh CLI is authenticated on this machine) with a title like `refactor: unify post-lifecycle approval logic into a shared module` and a body summarizing the change and linking both the design spec and this plan file. Wait for CI (`Lint & type-check`, `Test`, `Build`) to pass before flagging it as ready for Richard to review/merge — per established practice on this project, confirm with him before merging rather than merging autonomously, since this touches business-critical billing-adjacent logic (unlike the docs-only PR earlier this session).
