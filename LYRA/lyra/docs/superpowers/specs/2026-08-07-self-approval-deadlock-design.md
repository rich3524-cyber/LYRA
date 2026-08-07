# Self-Approval Deadlock Fix — Design Spec

## Background

`PATCH /api/posts/[id]/route.ts`'s approval logic enforces two independent rules when a post's status is being set to `APPROVED`: the reviewer's role must be in `APPROVER_ROLES` (everyone except read-only `CLIENT_VIEW`), and the reviewer must not be the post's own author. The self-approval rule exists so a single person can't both draft and approve content when a workspace has `clientAccessLevel: APPROVE` turned on — the whole point of that setting is giving a second party (typically the agency's client) a real review step before anything publishes.

A UI bug (already fixed this session) meant only the `CLIENT_APPROVE` role ever saw an Approve button at all, even though the backend authorizes four other roles too. Fixing that surfaced a deeper, structural issue: any workspace where nobody with approver access is a different person from whoever drafted a given post hits a hard deadlock — nobody can ever approve it, because whoever tries is always the post's own author.

Investigation confirmed this isn't a hypothetical edge case. `clientAccessLevel` is set via an agency's "New Client" flow (defaulting to `NONE`, opt-in), specifically for agencies giving a distinct client workspace some level of review control. The realistic trigger is a solo or small agency that creates a client workspace with `clientAccessLevel: APPROVE`, intending the real client to eventually log in and review, but drafts and schedules content themselves in the meantime — before that client ever accepts an invite. `WorkspaceAccess` has no pending/invited state (any row that exists is already-active access), so this is cleanly detectable: it's a deadlock exactly when no *other* `WorkspaceAccess` row on the workspace has an approver-capable role.

## Rule change

The self-approval rejection becomes conditional. When the reviewer is the post's own author, check whether any *other* `WorkspaceAccess` row on that workspace has a role in `APPROVER_ROLES`. If one exists, the rule applies exactly as today — reject with "Cannot approve your own post," since someone else genuinely can review it. If none exists, allow the approval through: a rule with no possible resolution isn't a safeguard, it's a deadlock, and blocking it doesn't protect anything real.

This preserves the rule's actual purpose (preventing a solo drafter from rubber-stamping their own content when a genuine second reviewer is available) while closing the case where enforcing it strictly would mean the post can never leave `PENDING_APPROVAL`.

## Backend implementation

In `app/api/posts/[id]/route.ts`'s `PATCH` handler, inside the existing `status === 'APPROVED'` branch, replace the flat `user.id === existing.authorId` rejection with:

```ts
if (user.id === existing.authorId) {
  const otherApprover = await prisma.workspaceAccess.findFirst({
    where: {
      workspaceId: existing.workspaceId,
      userId: { not: user.id },
      role: { in: APPROVER_ROLES },
    },
  })
  if (otherApprover) {
    return NextResponse.json({ error: 'Cannot approve your own post' }, { status: 403 })
  }
  // No one else on this workspace could ever approve this post -- proceed.
}
```

`APPROVER_ROLES` is already the shared, exported constant from `lib/authz.ts` (added earlier this session) — this reuses it, not a new list.

## Data plumbing (frontend)

No new API endpoints. Everything rides on data already fetched or trivially extendable:

- `app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` (a server component) already runs a direct Prisma query for `userRole`/`clientAccessLevel`. Its `access` selection is extended from `{ where: { userId: user.id }, select: { role: true } }` to fetch every member's `userId` and `role` for the workspace, from which `hasOtherApprover` is computed server-side (`workspace.access.some(a => a.userId !== user.id && APPROVER_ROLES.includes(a.role))`). Both `hasOtherApprover` and `currentUserId` (already available as `user.id`) are passed down as new props through `ContentCalendar` → `PostDetailPanel`.
- `GET /api/posts`'s existing `select` gains `authorId: true` (already a column on `Post`, just not currently returned). `CalendarPost`'s type gains `authorId: string`.

## Frontend UI logic

`getNextStatuses` gains two new parameters: `isAuthor: boolean` and `hasOtherApprover: boolean`. For a `PENDING_APPROVAL` post where the viewer's role can approve:

| Situation | Buttons shown |
|---|---|
| Not the author | `Approve` / `Request changes` (unchanged from the earlier fix) |
| Author, another approver exists on the workspace | `Recall for editing` only — matches the backend's rejection, so no button is shown that's known to fail |
| Author, no other approver exists | `Approve (no other reviewer available)` / `Request changes` — the label makes explicit that no real second-party review is happening, rather than looking identical to a normal approval |

This is computed at the call site in `PostDetailPanel` (`isAuthor = post.authorId === currentUserId`) and passed into the existing pure `getNextStatuses` function, keeping it free of any new prop-drilling concerns of its own.

## Testing & rollout

- Backend: extend `app/api/posts/[id]/route.test.ts`'s existing self-approval coverage with two new cases — self-approval rejected when another approver exists (unchanged behavior, now via the conditional path), and self-approval allowed when no other approver exists.
- Frontend: extend `components/lyra/calendar/post-detail-panel.test.ts`'s `getNextStatuses` suite with the three-row matrix above, plus confirming non-author behavior is unchanged.
- No migration, no new infrastructure — purely query and logic changes against existing data.
- Manual verification (Richard's step): approve a post on the real LYRA workspace now that the fix is live. Given that workspace has two `AGENCY_ADMIN` access grants, the actual behavior will depend on whether the second account is a real, usable login — either the post now requires that second account to approve (if it's real), or self-approval succeeds with the "no other reviewer available" label (if it isn't).
