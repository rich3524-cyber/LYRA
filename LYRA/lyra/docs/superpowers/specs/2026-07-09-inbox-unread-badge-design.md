# Inbox Unread Badge — Design Spec

**Date:** 2026-07-09
**Priority:** —
**Status:** Approved for implementation

---

## Overview

Show an Outlook-style unread count badge on the "Inbox" sidebar nav item when there are comments needing attention in the current workspace — visible at a glance without opening the Inbox page.

**Unread definition:** a comment counts as unread if its `status` is one of `PENDING`, `AI_DRAFTED`, `AWAITING_APPROVAL`, or `ESCALATED` — i.e. anything that would appear in the Inbox's existing "Pending" or "Escalated" tabs (`components/lyra/inbox/response-inbox.tsx:110-111`). `RESPONDED` and `IGNORED` comments don't count.

**Update timing:** computed fresh on every server render (page navigation or reload) — no polling, no new client-side fetch loop. This matches how the rest of the app shell already works: `app/(dashboard)/layout.tsx` is `export const dynamic = 'force-dynamic'` and already re-resolves workspace-scoped data (like `brandReady`, `plan`) on every request.

**Display:** capped at `99+` for large counts, so the badge stays a consistent compact width regardless of workspace volume.

---

## Data Flow

`app/(dashboard)/layout.tsx` already does one workspace-scoped Prisma query inside `if (workspaceId) { ... }` to compute `brandReady` and `workspacePlan`, then passes them to `<AppShellClient>`. Add one more query in that same block:

```typescript
let unreadCount = 0
if (workspaceId) {
  const ws = await prisma.workspace.findFirst({ /* existing query, unchanged */ })
  brandReady = !!(ws?.websiteUrl && (ws._count?.socialAccounts ?? 0) > 0)
  workspacePlan = ws?.plan ?? undefined

  unreadCount = await prisma.comment.count({
    where: {
      workspaceId,
      status: { in: ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL', 'ESCALATED'] },
    },
  })
}
```

Pass `unreadCount` as a new prop to `<AppShellClient>`, which threads it through to `<Sidebar>` the same way it already threads `plan` (`components/lyra/app-shell/app-shell-client.tsx`).

No new API route. No new database model. No schema changes.

---

## Sidebar Rendering (`components/lyra/app-shell/sidebar.tsx`)

`Sidebar` gains a new prop: `unreadCount?: number`.

The `navItems` array is a flat list of `{ href, label, icon, proOnly }` shared by both the desktop sidebar and the mobile drawer (`renderNavItems`, called from `renderContent(isCollapsed, isMobile)`). Rather than adding a new field to every item, `renderNavItems` special-cases `href === '/inbox'` (the same way it already special-cases `/brand` and `/assistant`) to render the badge:

- **Expanded (desktop uncollapsed, or mobile drawer — `isMobile` always renders with `isCollapsed = false`):** a small rounded pill showing the count (or `99+`), right-aligned in the row after the label, only rendered when `unreadCount > 0`. Rough shape: `<span className="ml-auto ... bg-status-error text-background-primary ...">{unreadCount > 99 ? '99+' : unreadCount}</span>` inside the existing label's flex row.
- **Collapsed (desktop only, icon-only 64px rail):** no room for a pill. Render a small dot (no number) positioned on the icon's top-right corner, only when `unreadCount > 0` — matches the existing absolute-positioning pattern already used elsewhere in this component (e.g. the collapse-toggle button uses `absolute` positioning off `motion.aside`, which is `relative`).

Both states share the same underlying boolean (`unreadCount > 0`) and the same capped label logic — only the container/positioning differs between collapsed and expanded.

---

## Testing

No test coverage exists for `Sidebar` or `app/(dashboard)/layout.tsx` today (this codebase doesn't unit-test layout/nav components — consistent with the broader convention that UI is manually verified, not unit-tested, established in prior features). Manual verification only:

- Workspace with 0 qualifying comments → no badge, no dot, in either sidebar state.
- Workspace with a small number (e.g. 3) qualifying comments → badge shows "3" when expanded, dot shows when collapsed.
- Workspace with 100+ qualifying comments → badge shows "99+" when expanded.
- Responding to a comment (moving it out of the counted statuses) and reloading the page → count decreases accordingly.
- Mobile drawer shows the same numbered badge as the expanded desktop sidebar (never the dot).

---

## Out of Scope

- Live/polling updates while staying on one page — deferred, no existing polling infrastructure in this app to build on.
- Per-platform or per-tab breakdown of the count (e.g. showing how many are Escalated vs Pending separately) — single combined number only.
- Badges on other nav items (e.g. Compose, Calendar) — Inbox only, per the request.
