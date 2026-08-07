# Self-Approval Deadlock Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a post's own author approve it when, and only when, no other approver-capable member exists on the workspace — closing the permanent approval deadlock a solo operator hits when `clientAccessLevel: APPROVE` is on but nobody else can review.

**Architecture:** Backend: `PATCH /api/posts/[id]`'s existing self-approval rejection becomes conditional on a `WorkspaceAccess` lookup for any *other* approver-capable member. Frontend: the calendar page (server component) computes `hasOtherApprover` once per page load and threads it, plus `currentUserId`, down through `ContentCalendar` to `PostDetailPanel`, whose pure `getNextStatuses` function gains an `isAuthor`/`hasOtherApprover`-aware three-way branch for the `PENDING_APPROVAL` state.

**Tech Stack:** Next.js 16 App Router, Prisma 6, Vitest 4, TypeScript 5. No new dependencies, no schema migration.

---

### Task 1: Backend — conditional self-approval rule

**Files:**
- Modify: `app/api/posts/[id]/route.ts:70-82`
- Test: `app/api/posts/[id]/route.test.ts` (extend the existing `describe('PATCH /api/posts/[id] — approval authorization (status: APPROVED)', ...)` block at line 151)

- [ ] **Step 1: Write the two failing tests**

Add these two `it` blocks inside the existing `describe('PATCH /api/posts/[id] — approval authorization (status: APPROVED)', ...)` block in `app/api/posts/[id]/route.test.ts`, immediately after the existing `'allows approval when the reviewer has an approver role and did not author the post'` test (currently ends at line 210, just before the block's closing `})`):

```typescript
  it('rejects self-approval with 403 when another approver-capable member exists on the workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-1',
      content: 'x', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst)
      .mockResolvedValueOnce({ role: 'SMB_OWNER' } as any)    // the reviewer's own access row
      .mockResolvedValueOnce({ role: 'AGENCY_ADMIN' } as any) // a different, approver-capable member

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Cannot approve your own post')
    expect(prisma.workspaceAccess.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        workspaceId: 'ws-1',
        userId: { not: 'user-1' },
        role: { in: [...APPROVER_ROLES] },
      },
    })
    expect(prisma.post.update).not.toHaveBeenCalled()
  })

  it('allows self-approval when no other approver-capable member exists on the workspace', async () => {
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
    expect(body.status).toBe('APPROVED')
  })
```

This requires importing `APPROVER_ROLES` in the test file. Add it to the existing import block near the top of `app/api/posts/[id]/route.test.ts`:

```typescript
import { APPROVER_ROLES } from '@/lib/authz'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/posts/[id]/route.test.ts`
Expected: FAIL — both new tests fail. The first fails because the current code rejects on the very first self-authorship check without ever making the second `workspaceAccess.findFirst` call, so `toHaveBeenNthCalledWith(2, ...)` finds no second call. The second fails because the current code returns 403 unconditionally for a self-approval, never reaching the 200 path.

- [ ] **Step 3: Implement the conditional rule**

In `app/api/posts/[id]/route.ts`, replace lines 70-82:

```typescript
    // Approval requires a real reviewer, not just any member and not the post's own author
    if (status === 'APPROVED') {
      const access = await prisma.workspaceAccess.findFirst({
        where:  { workspaceId: existing.workspaceId, userId: user.id },
        select: { role: true },
      })
      if (!access || !APPROVER_ROLES.includes(access.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (user.id === existing.authorId) {
        return NextResponse.json({ error: 'Cannot approve your own post' }, { status: 403 })
      }
    }
```

with:

```typescript
    // Approval requires a real reviewer, not just any member. Self-approval is
    // blocked UNLESS no other approver-capable member exists on the workspace --
    // otherwise a solo operator (e.g. SMB_OWNER) who turns on clientAccessLevel:
    // APPROVE before a genuine second reviewer is active would hit a permanent
    // deadlock, since whoever tries to approve is always the post's own author.
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
        if (otherApprover) {
          return NextResponse.json({ error: 'Cannot approve your own post' }, { status: 403 })
        }
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/posts/[id]/route.test.ts`
Expected: PASS — all tests in the file pass, including the two new ones and the three pre-existing tests in the same `describe` block (the pre-existing "rejects with 403 ... own author" test at line 175 uses a single non-`Once` `mockResolvedValue({ role: 'AGENCY_ADMIN' })`, which now answers both the access-role call and the otherApprover call identically — the otherApprover call also resolves truthy, so that test's expected 403 outcome is unchanged).

- [ ] **Step 5: Commit**

```bash
git add app/api/posts/[id]/route.ts app/api/posts/[id]/route.test.ts
git commit -m "$(cat <<'EOF'
fix: allow self-approval only when no other approver exists

The self-approval rejection in PATCH /api/posts/[id] was unconditional,
so any workspace where nobody with approver-capable access is a
different person from the post's author hit a permanent deadlock --
most realistically a solo/small agency that turns on
clientAccessLevel: APPROVE before a real second reviewer is active.
Now checks for another approver-capable WorkspaceAccess row on the
same workspace before rejecting; if none exists, the rule has nothing
left to protect against, so the approval goes through.
EOF
)"
```

---

### Task 2: `authorId` plumbing — GET /api/posts + CalendarPost type

**Files:**
- Modify: `app/api/posts/route.ts:62-76`
- Modify: `components/lyra/calendar/post-preview-card.tsx:20-33`

- [ ] **Step 1: Add `authorId` to the GET select**

In `app/api/posts/route.ts`, the `GET` handler's `prisma.post.findMany` call currently selects (lines 62-76):

```typescript
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        platformPostId: true,
        mediaUrls: true,
        aiGenerated: true,
        failureReason: true,
        requiresMedia: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost: true,
      },
```

Add `authorId: true` right after `id: true`:

```typescript
      select: {
        id: true,
        authorId: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        platformPostId: true,
        mediaUrls: true,
        aiGenerated: true,
        failureReason: true,
        requiresMedia: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost: true,
      },
```

- [ ] **Step 2: Add `authorId` to the `CalendarPost` type**

In `components/lyra/calendar/post-preview-card.tsx`, the `CalendarPost` interface currently reads (lines 20-33):

```typescript
export interface CalendarPost {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformPostId: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  failureReason: string | null
  requiresMedia: boolean
  socialAccount: { platform: string; name: string; platformId: string; adAccountId: string | null }
  boost: PostBoost | null
}
```

Add `authorId: string` right after `id: string`:

```typescript
export interface CalendarPost {
  id: string
  authorId: string
  content: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformPostId: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  failureReason: string | null
  requiresMedia: boolean
  socialAccount: { platform: string; name: string; platformId: string; adAccountId: string | null }
  boost: PostBoost | null
}
```

- [ ] **Step 3: Run typecheck to verify nothing else broke**

Run: `npx tsc --noEmit`
Expected: PASS — no errors. (There is no dedicated test file for either of these two changes; both are plain type/select additions that flow through the existing pipeline, exercised end-to-end by Task 5's tests once `PostDetailPanel` starts reading `post.authorId`.)

- [ ] **Step 4: Commit**

```bash
git add app/api/posts/route.ts components/lyra/calendar/post-preview-card.tsx
git commit -m "$(cat <<'EOF'
feat: expose authorId on calendar posts

Needed by the upcoming self-approval-deadlock fix, which has to know
whether the current viewer is the post's own author -- authorId was
already a column on Post, just never returned by the calendar's GET
endpoint or present on the frontend CalendarPost type.
EOF
)"
```

---

### Task 3: Calendar page — compute `hasOtherApprover`, pass new props

**Files:**
- Modify: `app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx`

- [ ] **Step 1: Change the `access` selection and compute `hasOtherApprover`**

In `app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx`, the `prisma.workspace.findFirst` query currently reads:

```typescript
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      plan: true,
      clientAccessLevel: true,
      brandProfile: { select: { id: true } },
      socialAccounts: { where: { isActive: true }, select: { platform: true } },
      access: { where: { userId: user.id }, select: { role: true } },
    },
  })

  if (!workspace) notFound()

  const hasBrandProfile    = workspace.brandProfile !== null
  const connectedPlatforms = [...new Set(workspace.socialAccounts.map(a => a.platform))]
  const userRole           = workspace.access[0]?.role ?? 'SMB_OWNER'
```

Replace it with:

```typescript
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      plan: true,
      clientAccessLevel: true,
      brandProfile: { select: { id: true } },
      socialAccounts: { where: { isActive: true }, select: { platform: true } },
      // Every member's role is needed (not just the current user's) to compute
      // hasOtherApprover below -- whether a second, approver-capable person
      // besides the current viewer exists on this workspace.
      access: { select: { userId: true, role: true } },
    },
  })

  if (!workspace) notFound()

  const hasBrandProfile    = workspace.brandProfile !== null
  const connectedPlatforms = [...new Set(workspace.socialAccounts.map(a => a.platform))]
  const userRole           = workspace.access.find(a => a.userId === user.id)?.role ?? 'SMB_OWNER'
  const hasOtherApprover   = workspace.access.some(
    a => a.userId !== user.id && (APPROVER_ROLES as readonly string[]).includes(a.role)
  )
```

Add the import alongside the existing ones near the top of the file:

```typescript
import { APPROVER_ROLES } from '@/lib/authz'
```

- [ ] **Step 2: Pass the two new props to `ContentCalendar`**

The JSX at the bottom of the file currently reads:

```typescript
      <ContentCalendar
        workspaceId={workspaceId}
        plan={workspace.plan}
        userRole={userRole}
        clientAccessLevel={workspace.clientAccessLevel}
      />
```

Replace it with:

```typescript
      <ContentCalendar
        workspaceId={workspaceId}
        plan={workspace.plan}
        userRole={userRole}
        clientAccessLevel={workspace.clientAccessLevel}
        hasOtherApprover={hasOtherApprover}
        currentUserId={user.id}
      />
```

This will not typecheck cleanly until Task 4 adds the two new props to `ContentCalendarProps` — that's expected; Task 4 immediately follows.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx"
git commit -m "$(cat <<'EOF'
feat: compute hasOtherApprover on the calendar page

Server-side computation of whether any workspace member besides the
current user can approve posts, needed by the self-approval-deadlock
fix. access is now fetched for every member (not just the current
user) so this can be derived without an extra query.
EOF
)"
```

(This commit will leave the build type-broken until Task 4 lands — that's fine for a same-session, direct-to-main workflow where the very next task fixes it; do not run `npm run build` as a gate between Task 3 and Task 4.)

---

### Task 4: `content-calendar.tsx` — forward the new props

**Files:**
- Modify: `components/lyra/calendar/content-calendar.tsx:114-121` (props interface + destructuring), `:459-469` (call site)

- [ ] **Step 1: Extend `ContentCalendarProps` and the component signature**

In `components/lyra/calendar/content-calendar.tsx`, the props interface and function signature currently read:

```typescript
interface ContentCalendarProps {
  workspaceId: string
  plan: 'STARTER' | 'PRO' | 'AGENCY'
  userRole: string
  clientAccessLevel: string
}

export function ContentCalendar({ workspaceId, plan, userRole, clientAccessLevel }: ContentCalendarProps) {
```

Replace with:

```typescript
interface ContentCalendarProps {
  workspaceId: string
  plan: 'STARTER' | 'PRO' | 'AGENCY'
  userRole: string
  clientAccessLevel: string
  hasOtherApprover: boolean
  currentUserId: string
}

export function ContentCalendar({ workspaceId, plan, userRole, clientAccessLevel, hasOtherApprover, currentUserId }: ContentCalendarProps) {
```

- [ ] **Step 2: Forward the two props to `PostDetailPanel`**

The `PostDetailPanel` render at the bottom of the file currently reads:

```typescript
      {/* Detail panel — outside DndContext to avoid z-index conflicts */}
      <PostDetailPanel
        post={selectedPost}
        workspaceId={workspaceId}
        plan={plan}
        userRole={userRole}
        clientAccessLevel={clientAccessLevel}
        onClose={() => setSelectedPost(null)}
        onDeleted={handlePostDeleted}
        onUpdated={handlePostUpdated}
      />
```

Replace it with:

```typescript
      {/* Detail panel — outside DndContext to avoid z-index conflicts */}
      <PostDetailPanel
        post={selectedPost}
        workspaceId={workspaceId}
        plan={plan}
        userRole={userRole}
        clientAccessLevel={clientAccessLevel}
        hasOtherApprover={hasOtherApprover}
        currentUserId={currentUserId}
        onClose={() => setSelectedPost(null)}
        onDeleted={handlePostDeleted}
        onUpdated={handlePostUpdated}
      />
```

This will not typecheck cleanly until Task 5 adds the two new props to `PostDetailPanel`'s `Props` interface — that's expected; Task 5 immediately follows.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/calendar/content-calendar.tsx
git commit -m "$(cat <<'EOF'
feat: thread hasOtherApprover and currentUserId to PostDetailPanel

Pure prop-forwarding -- ContentCalendar has no logic of its own that
needs these two values, it just sits between the calendar page (which
computes them) and PostDetailPanel (which needs them for the
self-approval-deadlock fix).
EOF
)"
```

---

### Task 5: `post-detail-panel.tsx` — three-way approval UI + tests

**Files:**
- Modify: `components/lyra/calendar/post-detail-panel.tsx:33-98` (`getNextStatuses`), `:116-127` (`Props` + component signature), `:253` (call site)
- Test: `components/lyra/calendar/post-detail-panel.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `components/lyra/calendar/post-detail-panel.test.ts`, immediately before the file's closing `})` (after the existing `describe('isAwaitingMedia filtering', ...)` block, which currently ends the file at line 94):

```typescript
  describe('PENDING_APPROVAL — author / hasOtherApprover matrix', () => {
    // Not the author: unchanged from the existing PENDING_APPROVAL coverage
    // above (isAuthor defaults to false when omitted), regardless of
    // hasOtherApprover.
    it('offers the normal Approve/Request changes pair when the viewer did not author the post', () => {
      const options = getNextStatuses('PENDING_APPROVAL', 'AGENCY_ADMIN', 'APPROVE', false, false, true)
      expect(options).toEqual([
        { value: 'APPROVED', label: 'Approve', variant: 'approve' },
        { value: 'DRAFT', label: 'Request changes', variant: 'reject' },
      ])
    })

    // Author, but another approver-capable member exists on the workspace:
    // matches the backend's rejection, so only the non-approval action shows
    // -- no button is offered that's known to fail with 403.
    it('offers only "Recall for editing" when the viewer authored the post and another approver exists', () => {
      const options = getNextStatuses('PENDING_APPROVAL', 'AGENCY_ADMIN', 'APPROVE', false, true, true)
      expect(options).toEqual([
        { value: 'DRAFT', label: 'Recall for editing' },
      ])
    })

    // Author, and no other approver exists anywhere on the workspace: the
    // deadlock case -- self-approval is allowed, but labeled explicitly so
    // it's clear no real second-party review took place.
    it('offers a labeled self-approval option when the viewer authored the post and no other approver exists', () => {
      const options = getNextStatuses('PENDING_APPROVAL', 'AGENCY_ADMIN', 'APPROVE', false, true, false)
      expect(options).toEqual([
        { value: 'APPROVED', label: 'Approve (no other reviewer available)', variant: 'approve' },
        { value: 'DRAFT', label: 'Request changes', variant: 'reject' },
      ])
    })

    // isAuthor/hasOtherApprover are opt-in parameters -- every pre-existing
    // call site in this file (and any other caller) that only ever passed 4
    // arguments must keep behaving exactly as before.
    it('defaults to non-author behavior when isAuthor and hasOtherApprover are omitted', () => {
      const options = getNextStatuses('PENDING_APPROVAL', 'AGENCY_ADMIN', 'APPROVE', false)
      expect(options).toEqual([
        { value: 'APPROVED', label: 'Approve', variant: 'approve' },
        { value: 'DRAFT', label: 'Request changes', variant: 'reject' },
      ])
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/lyra/calendar/post-detail-panel.test.ts`
Expected: FAIL with a TypeScript error — `getNextStatuses` doesn't yet accept a 5th or 6th argument, and the current PENDING_APPROVAL branch doesn't vary its output by author/approver status at all, so the "Recall for editing" and labeled-approval assertions fail even once the extra arguments are accepted.

- [ ] **Step 3: Implement the three-way branch in `getNextStatuses`**

In `components/lyra/calendar/post-detail-panel.tsx`, the function signature and `PENDING_APPROVAL` branch currently read:

```typescript
export function getNextStatuses(
  status: string,
  userRole: string,
  clientAccessLevel: string,
  isAwaitingMedia: boolean,
): { value: string; label: string; variant?: 'approve' | 'reject' }[] {
  // Matches the backend's own APPROVER_ROLES (app/api/posts/[id]/route.ts) --
  // previously this only checked for the CLIENT_APPROVE role specifically, so
  // PLATFORM_OWNER/AGENCY_ADMIN/AGENCY_MEMBER/SMB_OWNER accounts (everyone the
  // backend actually authorizes to approve) had no Approve option in the UI at
  // all for a PENDING_APPROVAL post, only "Recall for editing". The backend
  // still separately rejects a self-approval attempt (a post's own author
  // clicking Approve gets a 403 there), so this doesn't grant anything the
  // API wouldn't already allow.
  const canApprove      = (APPROVER_ROLES as readonly string[]).includes(userRole)
  const hasApprovalFlow = clientAccessLevel === 'APPROVE'

  const options = (() => {
    if (status === 'PENDING_APPROVAL' && canApprove) {
      return [
        { value: 'APPROVED', label: 'Approve',         variant: 'approve' as const },
        { value: 'DRAFT',    label: 'Request changes', variant: 'reject'  as const },
      ]
    }
```

Replace with:

```typescript
export function getNextStatuses(
  status: string,
  userRole: string,
  clientAccessLevel: string,
  isAwaitingMedia: boolean,
  isAuthor = false,
  hasOtherApprover = false,
): { value: string; label: string; variant?: 'approve' | 'reject' }[] {
  // Matches the backend's own APPROVER_ROLES (app/api/posts/[id]/route.ts) --
  // previously this only checked for the CLIENT_APPROVE role specifically, so
  // PLATFORM_OWNER/AGENCY_ADMIN/AGENCY_MEMBER/SMB_OWNER accounts (everyone the
  // backend actually authorizes to approve) had no Approve option in the UI at
  // all for a PENDING_APPROVAL post, only "Recall for editing".
  const canApprove      = (APPROVER_ROLES as readonly string[]).includes(userRole)
  const hasApprovalFlow = clientAccessLevel === 'APPROVE'

  const options = (() => {
    // Mirrors the backend's conditional self-approval rule
    // (app/api/posts/[id]/route.ts): the author can't approve their own post
    // when someone else on the workspace genuinely could, so that case only
    // offers the non-approval action -- no button is shown that's known to
    // fail with 403. When no other approver exists anywhere on the
    // workspace, self-approval is allowed but the label makes explicit that
    // no real second-party review is happening.
    if (status === 'PENDING_APPROVAL' && canApprove && isAuthor && hasOtherApprover) {
      return [
        { value: 'DRAFT', label: 'Recall for editing' },
      ]
    }
    if (status === 'PENDING_APPROVAL' && canApprove && isAuthor && !hasOtherApprover) {
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/lyra/calendar/post-detail-panel.test.ts`
Expected: PASS — all tests pass, including the 4 new ones and all 18 pre-existing tests (which never pass a 5th/6th argument, so they exercise the `isAuthor = false` default path, i.e. the original unconditional `PENDING_APPROVAL && canApprove` branch).

- [ ] **Step 5: Wire `isAuthor`/`hasOtherApprover` into the `Props` interface and call site**

The `Props` interface currently reads:

```typescript
interface Props {
  post: CalendarPost | null
  workspaceId: string
  plan: 'STARTER' | 'PRO' | 'AGENCY'
  userRole: string
  clientAccessLevel: string
  onClose: () => void
  onDeleted: (id: string) => void
  onUpdated: (updated: CalendarPost) => void
}

export function PostDetailPanel({ post, workspaceId, plan, userRole, clientAccessLevel, onClose, onDeleted, onUpdated }: Props) {
```

Replace with:

```typescript
interface Props {
  post: CalendarPost | null
  workspaceId: string
  plan: 'STARTER' | 'PRO' | 'AGENCY'
  userRole: string
  clientAccessLevel: string
  hasOtherApprover: boolean
  currentUserId: string
  onClose: () => void
  onDeleted: (id: string) => void
  onUpdated: (updated: CalendarPost) => void
}

export function PostDetailPanel({ post, workspaceId, plan, userRole, clientAccessLevel, hasOtherApprover, currentUserId, onClose, onDeleted, onUpdated }: Props) {
```

The `nextStatuses` call site currently reads (originally around line 253):

```typescript
  const nextStatuses   = post ? getNextStatuses(post.status, userRole, clientAccessLevel, isAwaitingMedia) : []
```

Replace with:

```typescript
  const isAuthor       = post ? post.authorId === currentUserId : false
  const nextStatuses   = post ? getNextStatuses(post.status, userRole, clientAccessLevel, isAwaitingMedia, isAuthor, hasOtherApprover) : []
```

- [ ] **Step 6: Run the full test file and typecheck once more**

Run: `npx vitest run components/lyra/calendar/post-detail-panel.test.ts`
Expected: PASS — same result as Step 4 (this step wired the pure function into the component; it doesn't change `getNextStatuses`'s own test coverage).

Run: `npx tsc --noEmit`
Expected: PASS — no errors. This is the step that resolves the type errors Task 3 and Task 4 intentionally left open (`ContentCalendar` now has real `hasOtherApprover`/`currentUserId` props to forward, and `PostDetailPanel` now declares and consumes them).

- [ ] **Step 7: Commit**

```bash
git add components/lyra/calendar/post-detail-panel.tsx components/lyra/calendar/post-detail-panel.test.ts
git commit -m "$(cat <<'EOF'
feat: close the self-approval deadlock in the calendar UI

getNextStatuses now mirrors the backend's conditional self-approval
rule: an author whose post is PENDING_APPROVAL sees only "Recall for
editing" when someone else on the workspace could approve it (no
button shown that's known to fail), or a labeled
"Approve (no other reviewer available)" option when nobody else can --
making it explicit that no real second-party review took place.
isAuthor/hasOtherApprover default to false so every pre-existing call
site is unaffected.
EOF
)"
```

---

### Final check

- [ ] **Run the full test suite once, after all 5 tasks are committed**

Run: `npm test`
Expected: PASS — every test file in the project passes, including `app/api/posts/[id]/route.test.ts` and `components/lyra/calendar/post-detail-panel.test.ts`.

- [ ] **Run a full production build**

Run: `npm run build`
Expected: PASS — no type errors across the whole app (this is the first point after Task 3 where the intentionally-broken intermediate state is fully resolved and verified end-to-end).
