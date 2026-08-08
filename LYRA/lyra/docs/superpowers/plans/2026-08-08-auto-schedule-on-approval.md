# Auto-Schedule on Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approving a post transitions it straight to `SCHEDULED` when its media requirement is already met, removing the separate manual "Schedule post" click; `APPROVED` becomes a narrower status meaning "approved, still waiting on media" — and the UI's existing "Awaiting media" badge now covers that case instead of showing a bare "Approved" label.

**Architecture:** Backend: `PATCH /api/posts/[id]`'s existing `finalStatus` computation gains one more branch that resolves an approval request straight to `SCHEDULED` when media is ready, while the `PostApproval` bookkeeping keys off the requested action (an approval happened) rather than the resulting status, so the review record is written correctly either way. Frontend: the "Awaiting media" badge condition in two components is widened from `status === 'DRAFT'` to `status === 'DRAFT' || status === 'APPROVED'`, since post-fix `APPROVED` can only mean "awaiting media."

**Tech Stack:** Next.js 16 App Router, Prisma 6, Vitest 4, TypeScript 5. No new dependencies, no schema migration.

---

### Task 1: Backend — auto-schedule on approval when media is ready

**Files:**
- Modify: `app/api/posts/[id]/route.ts:123-132` (finalStatus computation), `:148-166` (PostApproval bookkeeping)
- Test: `app/api/posts/[id]/route.test.ts` (update 2 existing tests in the `describe('PATCH /api/posts/[id] — approval authorization (status: APPROVED)', ...)` block, add 1 new test)

- [ ] **Step 1: Update the two existing tests whose expected outcome changes**

In `app/api/posts/[id]/route.test.ts`, the test `'allows approval when the reviewer has an approver role and did not author the post'` (currently lines 194-211) uses `requiresMedia: false`, so after this change it will auto-schedule instead of stopping at `APPROVED`. Replace it with:

```typescript
  it('allows approval when the reviewer has an approver role and did not author the post, auto-scheduling since media is ready', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
        update: { status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
      })
    )
  })
```

Similarly, the test `'allows self-approval when no other approver-capable member exists on the workspace'` (currently lines 240-259) also uses `requiresMedia: false`. Replace it with:

```typescript
  it('allows self-approval when no other approver-capable member exists on the workspace, auto-scheduling since media is ready', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-1',
      content: 'x', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst)
      .mockResolvedValueOnce({ role: 'SMB_OWNER' } as any) // the reviewer's own access row
      .mockResolvedValueOnce(null)                          // nobody else on the workspace can approve
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
  })
```

- [ ] **Step 2: Add the new failing test for the media-missing case**

Add this test at the end of the same `describe('PATCH /api/posts/[id] — approval authorization (status: APPROVED)', ...)` block (after the two tests updated in Step 1, before the block's closing `})`):

```typescript
  it('stays at APPROVED (does not auto-schedule) when the post still requires media', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: [], requiresMedia: true,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('APPROVED')
    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
        update: { status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
      })
    )
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run "app/api/posts/[id]/route.test.ts"`
Expected: FAIL — the two updated tests fail because the current code still returns `body.status === 'APPROVED'` (not `'SCHEDULED'`), and the new test fails because there's no `mediaUrls`/`postApproval.upsert` assertion path exercising a media-missing approval today (it will actually currently pass on the `body.status === 'APPROVED'` part by coincidence, but confirm all 3 together via the full run — the two changed assertions are what must fail first).

- [ ] **Step 4: Implement the auto-schedule logic**

In `app/api/posts/[id]/route.ts`, replace the `contentChanged`/`finalStatus` block (currently lines 123-132):

```typescript
    const contentChanged =
      (content !== undefined && content !== existing.content) ||
      (mediaUrls !== undefined && mediaUrls.join('\u0000') !== existing.mediaUrls.join('\u0000'))

    const finalStatus: PostStatus | undefined =
      status === 'SCHEDULED' &&
      existing.workspace.clientAccessLevel === 'APPROVE' &&
      !(existing.status === 'APPROVED' && !contentChanged)
        ? 'PENDING_APPROVAL'
        : status
```

with:

```typescript
    const contentChanged =
      (content !== undefined && content !== existing.content) ||
      (mediaUrls !== undefined && mediaUrls.join('\u0000') !== existing.mediaUrls.join('\u0000'))

    // Approving no longer leaves the post sitting in APPROVED waiting for a
    // separate "Schedule post" click. If media requirements are already
    // satisfied, the approval itself is the last gate, so it goes straight to
    // SCHEDULED. APPROVED stays reachable only when the post still needs
    // media -- the existing manual "Schedule post" action remains available,
    // unchanged, once that media is attached.
    const effectiveMediaUrls = mediaUrls ?? existing.mediaUrls
    const isApprovingReadyPost =
      status === 'APPROVED' && !(existing.requiresMedia && effectiveMediaUrls.length === 0)

    const finalStatus: PostStatus | undefined = isApprovingReadyPost
      ? 'SCHEDULED'
      : status === 'SCHEDULED' &&
        existing.workspace.clientAccessLevel === 'APPROVE' &&
        !(existing.status === 'APPROVED' && !contentChanged)
        ? 'PENDING_APPROVAL'
        : status
```

- [ ] **Step 5: Fix the PostApproval bookkeeping to key off the request, not the result**

Immediately below, the `PostApproval` bookkeeping block (currently around lines 148-166) reads:

```typescript
    if (finalStatus === 'PENDING_APPROVAL') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'PENDING' },
        update: { status: 'PENDING', reviewedAt: null, reviewerId: null },
      })
    } else if (finalStatus === 'APPROVED') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
        update: { status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
      })
    } else if (finalStatus === 'DRAFT' && existing.status === 'PENDING_APPROVAL') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'REJECTED', reviewedAt: new Date() },
        update: { status: 'REJECTED', reviewedAt: new Date() },
      })
    }
```

Change only the middle branch's condition, from `finalStatus === 'APPROVED'` to `status === 'APPROVED'`, so the approval record is still written even when `finalStatus` jumps straight to `SCHEDULED`:

```typescript
    if (finalStatus === 'PENDING_APPROVAL') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'PENDING' },
        update: { status: 'PENDING', reviewedAt: null, reviewerId: null },
      })
    } else if (status === 'APPROVED') {
      // An approval decision happened, regardless of whether the post landed
      // on APPROVED (still awaiting media) or jumped straight to SCHEDULED.
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
        update: { status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
      })
    } else if (finalStatus === 'DRAFT' && existing.status === 'PENDING_APPROVAL') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'REJECTED', reviewedAt: new Date() },
        update: { status: 'REJECTED', reviewedAt: new Date() },
      })
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run "app/api/posts/[id]/route.test.ts"`
Expected: PASS — all tests in the file pass, including the 2 updated and 1 new test, and every other pre-existing test (the `approval-status resolution` describe block only ever sends `status: 'SCHEDULED'` requests, never `status: 'APPROVED'`, so `isApprovingReadyPost` is always `false` there and that block's behavior is untouched).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 8: Commit**

```bash
git add "app/api/posts/[id]/route.ts" "app/api/posts/[id]/route.test.ts"
git commit -m "$(cat <<'EOF'
feat: auto-schedule posts on approval when media is ready

Approving a post no longer leaves it sitting at APPROVED waiting for a
separate manual "Schedule post" click -- if media requirements are
already satisfied, approval itself is the last gate, so the post goes
straight to SCHEDULED. APPROVED now only means "approved, still
awaiting media" -- the existing manual "Schedule post" action remains
available, unchanged, once that media is attached. The PostApproval
record is still written on every approval regardless of which final
status the post lands on.
EOF
)"
```

---

### Task 2: Frontend — extend "Awaiting media" badge to cover Approved

**Files:**
- Modify: `components/lyra/calendar/post-preview-card.tsx:88`
- Modify: `components/lyra/calendar/post-detail-panel.tsx:347`, `:352`

- [ ] **Step 1: Widen the calendar-card badge condition**

In `components/lyra/calendar/post-preview-card.tsx`, line 88 currently reads:

```typescript
  const isAwaitingMedia = post.status === 'DRAFT' && post.requiresMedia && post.mediaUrls.length === 0
```

Replace it with:

```typescript
  const isAwaitingMedia = (post.status === 'DRAFT' || post.status === 'APPROVED') && post.requiresMedia && post.mediaUrls.length === 0
```

- [ ] **Step 2: Widen the detail-panel badge condition**

In `components/lyra/calendar/post-detail-panel.tsx`, the status badge (currently lines 344-353) reads:

```typescript
                <span
                  className={cn(
                    'font-sans text-xs px-2 py-0.5 rounded-md font-medium',
                    isAwaitingMedia && post.status === 'DRAFT'
                      ? 'bg-status-warning/20 text-status-warning'
                      : STATUS_COLORS[post.status] ?? 'bg-background-hover text-text-tertiary'
                  )}
                >
                  {isAwaitingMedia && post.status === 'DRAFT' ? 'Awaiting media' : (STATUS_LABEL[post.status] ?? post.status)}
                </span>
```

Replace both occurrences of `post.status === 'DRAFT'` in this snippet with `(post.status === 'DRAFT' || post.status === 'APPROVED')`:

```typescript
                <span
                  className={cn(
                    'font-sans text-xs px-2 py-0.5 rounded-md font-medium',
                    isAwaitingMedia && (post.status === 'DRAFT' || post.status === 'APPROVED')
                      ? 'bg-status-warning/20 text-status-warning'
                      : STATUS_COLORS[post.status] ?? 'bg-background-hover text-text-tertiary'
                  )}
                >
                  {isAwaitingMedia && (post.status === 'DRAFT' || post.status === 'APPROVED') ? 'Awaiting media' : (STATUS_LABEL[post.status] ?? post.status)}
                </span>
```

- [ ] **Step 3: Run the existing test suites to confirm nothing broke**

Run: `npx vitest run components/lyra/calendar/post-detail-panel.test.ts`
Expected: PASS — `getNextStatuses` itself is untouched by this task (it already used the status-agnostic `isAwaitingMedia` value passed into it from the component, not the badge's own local restriction), so all 22 existing tests still pass unmodified. No new test file is needed for this task — `isAwaitingMedia` in both files is a plain local `const`, not an exported pure function, and this codebase's testing convention (established this session) only unit-tests exported pure functions, not inline JSX conditionals.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 5: Commit**

```bash
git add components/lyra/calendar/post-preview-card.tsx components/lyra/calendar/post-detail-panel.tsx
git commit -m "$(cat <<'EOF'
feat: show "Awaiting media" instead of "Approved" when media is missing

After the auto-schedule-on-approval change, APPROVED can only mean
"approved, but still waiting on media" -- every other approval now
jumps straight to SCHEDULED. The existing "Awaiting media" badge
treatment (already used for DRAFT) now also covers APPROVED, in both
the calendar-grid card and the detail panel, so a post never shows a
bare "Approved" label that doesn't explain why it hasn't gone out yet.
EOF
)"
```

- [ ] **Step 6: Manual verification (not automated)**

In the running app: approve a media-ready `PENDING_APPROVAL` post and confirm it shows `Scheduled` immediately, with no separate "Schedule post" click needed. Separately, approve a post that still needs media and confirm it shows `Awaiting media` (not a bare `Approved`) in both the calendar-grid card and the detail panel; attach media to it and confirm the badge reverts to a normal status label and the manual "Schedule post" action becomes available again.

---

### Final check

- [ ] **Run the full test suite once, after both tasks are committed**

Run: `npm test`
Expected: PASS — every test file in the project passes.

- [ ] **Run a full production build**

Run: `npm run build`
Expected: PASS — no type errors across the whole app.
