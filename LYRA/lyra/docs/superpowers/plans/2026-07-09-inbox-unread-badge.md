# Inbox Unread Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an unread-comment-count badge on the "Inbox" sidebar nav item — a numbered pill when the sidebar is expanded, a plain dot when collapsed to icon-only — computed server-side on every navigation, no polling.

**Architecture:** `app/(dashboard)/layout.tsx` (already a `force-dynamic` server component that resolves the current workspace on every request) gains one more workspace-scoped `prisma.comment.count()` call, threaded down through `AppShellClient` to `Sidebar` the same way `plan` already is. `Sidebar`'s shared `renderNavItems` function special-cases the `/inbox` entry to render the count.

**Tech Stack:** Next.js App Router server component, Prisma, existing React client components (no new files, no schema changes).

**Spec:** `docs/superpowers/specs/2026-07-09-inbox-unread-badge-design.md`

---

## File Map

| File | Action |
|---|---|
| `app/(dashboard)/layout.tsx` | Modified — compute `unreadCount`, pass to `AppShellClient` |
| `components/lyra/app-shell/app-shell-client.tsx` | Modified — accept and forward `unreadCount` prop |
| `components/lyra/app-shell/sidebar.tsx` | Modified — accept `unreadCount` prop, render badge/dot on the Inbox nav item |

---

### Task 1: Compute and thread `unreadCount` through the app shell

**Files:**
- Modify: `app/(dashboard)/layout.tsx:48-72`
- Modify: `components/lyra/app-shell/app-shell-client.tsx`

- [ ] **Step 1: Add the count query in `layout.tsx`**

Find:

```typescript
  let brandReady = false
  let workspacePlan: string | undefined
  if (workspaceId) {
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: {
        plan: true,
        websiteUrl: true,
        _count: { select: { socialAccounts: { where: { isActive: true } } } },
      },
    }).catch(() => null)
    brandReady = !!(ws?.websiteUrl && (ws._count?.socialAccounts ?? 0) > 0)
    workspacePlan = ws?.plan ?? undefined
  }

  return (
    <AppShellClient
      user={user}
      workspaceId={workspaceId}
      brandReady={brandReady}
      plan={workspacePlan}
    >
      {children}
    </AppShellClient>
  )
```

Replace with:

```typescript
  let brandReady = false
  let workspacePlan: string | undefined
  let unreadCount = 0
  if (workspaceId) {
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: {
        plan: true,
        websiteUrl: true,
        _count: { select: { socialAccounts: { where: { isActive: true } } } },
      },
    }).catch(() => null)
    brandReady = !!(ws?.websiteUrl && (ws._count?.socialAccounts ?? 0) > 0)
    workspacePlan = ws?.plan ?? undefined

    unreadCount = await prisma.comment.count({
      where: {
        workspaceId,
        status: { in: ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL', 'ESCALATED'] },
      },
    }).catch(() => 0)
  }

  return (
    <AppShellClient
      user={user}
      workspaceId={workspaceId}
      brandReady={brandReady}
      plan={workspacePlan}
      unreadCount={unreadCount}
    >
      {children}
    </AppShellClient>
  )
```

The `.catch(() => 0)` mirrors the `.catch(() => null)` already used on the workspace query directly above it in this same block — a transient DB error here should degrade to "no badge," not break the whole dashboard shell.

- [ ] **Step 2: Accept and forward the prop in `AppShellClient`**

In `components/lyra/app-shell/app-shell-client.tsx`, find:

```typescript
interface AppShellClientProps {
  user: { name?: string | null; email: string; avatarUrl?: string | null }
  workspaceId: string
  brandReady: boolean
  plan?: string
  trendEnabled?: boolean
  children: React.ReactNode
}

export function AppShellClient({
  user,
  workspaceId,
  brandReady,
  plan,
  trendEnabled,
  children,
}: AppShellClientProps) {
```

Replace with:

```typescript
interface AppShellClientProps {
  user: { name?: string | null; email: string; avatarUrl?: string | null }
  workspaceId: string
  brandReady: boolean
  plan?: string
  trendEnabled?: boolean
  unreadCount?: number
  children: React.ReactNode
}

export function AppShellClient({
  user,
  workspaceId,
  brandReady,
  plan,
  trendEnabled,
  unreadCount,
  children,
}: AppShellClientProps) {
```

Then find where `<Sidebar>` is rendered:

```typescript
      <Sidebar
        workspaceId={workspaceId}
        brandReady={brandReady}
        plan={plan}
        trendEnabled={trendEnabled}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
```

Add `unreadCount`:

```typescript
      <Sidebar
        workspaceId={workspaceId}
        brandReady={brandReady}
        plan={plan}
        trendEnabled={trendEnabled}
        unreadCount={unreadCount}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (there will be an unused-prop-shaped gap until Task 2 adds `unreadCount` to `SidebarProps` — that's fine, `Sidebar` currently ignores unknown extra props at the JSX call site without erroring since TS only flags props declared in the interface; confirm this is actually the case when you run tsc, and if TS complains about passing `unreadCount` to a component that doesn't declare it, that means Task 2 needs to land in the same commit as this step — see note below).

**Note:** If `npx tsc --noEmit` errors here because `Sidebar` doesn't yet declare an `unreadCount` prop, that means TypeScript's JSX prop checking is stricter than assumed — in that case, do Task 2's `SidebarProps` change (just the interface field, not the rendering logic) as part of this same task before committing, so the type-check passes. Use your judgement; note in your report which happened.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx" "components/lyra/app-shell/app-shell-client.tsx"
git commit -m "feat(inbox): compute and thread unreadCount through the app shell"
```

---

### Task 2: Render the badge/dot on the Inbox nav item

**Files:**
- Modify: `components/lyra/app-shell/sidebar.tsx`

- [ ] **Step 1: Add `unreadCount` to `SidebarProps`**

Find:

```typescript
interface SidebarProps {
  workspaceId: string
  brandReady: boolean
  plan?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
  trendEnabled?: boolean
}

export function Sidebar({
  workspaceId,
  brandReady,
  plan,
  mobileOpen,
  onMobileClose,
  trendEnabled,
}: SidebarProps) {
```

Replace with:

```typescript
interface SidebarProps {
  workspaceId: string
  brandReady: boolean
  plan?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
  trendEnabled?: boolean
  unreadCount?: number
}

export function Sidebar({
  workspaceId,
  brandReady,
  plan,
  mobileOpen,
  onMobileClose,
  trendEnabled,
  unreadCount,
}: SidebarProps) {
```

- [ ] **Step 2: Render the badge/dot in `renderNavItems`**

Find the final `return` inside `renderNavItems` (the default case, after the `locked` and `isAssistant` early returns — this is the branch every normal nav item, including Inbox, falls through to):

```typescript
      return (
        <Link
          key={label}
          href={fullHref}
          className={cn(
            'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 group',
            isActive
              ? 'bg-background-hover text-text-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-background-hover',
          )}
          aria-label={isCollapsed ? label : undefined}
        >
          <Icon size={16} className="shrink-0" strokeWidth={isActive ? 2 : 1.5} />
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden whitespace-nowrap tracking-wide"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      )
    })
  }
```

Replace with:

```typescript
      const isInbox = href === '/inbox'
      const hasUnread = isInbox && (unreadCount ?? 0) > 0
      const unreadLabel = (unreadCount ?? 0) > 99 ? '99+' : String(unreadCount ?? 0)

      return (
        <Link
          key={label}
          href={fullHref}
          className={cn(
            'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 group',
            isActive
              ? 'bg-background-hover text-text-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-background-hover',
          )}
          aria-label={
            isCollapsed ? (hasUnread ? `${label} (unread comments)` : label) : undefined
          }
        >
          <span className="relative shrink-0">
            <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
            {hasUnread && isCollapsed && (
              <span
                className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-status-error"
                aria-hidden="true"
              />
            )}
          </span>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden whitespace-nowrap tracking-wide flex-1 flex items-center justify-between gap-2"
              >
                <span>{label}</span>
                {hasUnread && (
                  <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-status-error text-background-primary text-[10px] font-medium leading-none">
                    {unreadLabel}
                  </span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      )
    })
  }
```

Notes for the implementer:
- This is the *shared* render path for every non-locked, non-Assistant nav item — the icon now renders inside a `relative` wrapper span for all of them, but `hasUnread` is only ever true for the Inbox item (`isInbox` gates it), so no other nav item's visual output changes.
- The mobile drawer always calls `renderContent(false, true)` — i.e. `isCollapsed` is always `false` there — so mobile always gets the numbered pill, never the dot, matching the spec.
- `bg-status-error` / `text-background-primary` are existing design tokens already used elsewhere in this codebase (e.g. `components/lyra/inbox/response-inbox.tsx`, `components/lyra/settings/autonomy-selector.tsx`) — don't invent new color tokens.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "components/lyra/app-shell/sidebar.tsx"
git commit -m "feat(inbox): render unread count badge on the Inbox nav item"
```

---

### Task 3: Manual verification

No automated test coverage exists for `Sidebar` or the dashboard layout (established convention in this codebase — UI is manually verified, not unit-tested). This step happens after deploy, against a real workspace with a real session:

- [ ] **Step 1: Verify zero state**

Load any dashboard page for a workspace with no `PENDING`/`AI_DRAFTED`/`AWAITING_APPROVAL`/`ESCALATED` comments. Confirm no badge and no dot appear on the Inbox nav item, in both expanded and collapsed (click the collapse toggle) sidebar states.

- [ ] **Step 2: Verify a small count**

With a workspace that has a few qualifying comments (or manually flip a `Comment.status` to `PENDING` via Supabase if none exist), reload. Confirm the expanded sidebar shows the numbered pill next to "Inbox" with the correct count, and the collapsed sidebar shows a small dot instead.

- [ ] **Step 3: Verify the 99+ cap**

If practical, bulk-update enough comments to `PENDING` status to exceed 99, reload, and confirm the badge shows "99+" rather than the literal number. (Skip this step if there's no easy way to generate 100+ comments — not worth manufacturing test data for.)

- [ ] **Step 4: Verify count changes on response**

Respond to (or otherwise move to `RESPONDED`/`IGNORED`) one of the counted comments via the Inbox page, then navigate away and back (or reload). Confirm the count decreases by one.

- [ ] **Step 5: Verify mobile drawer**

On a narrow viewport (or the mobile drawer via the hamburger menu), confirm the Inbox item shows the same numbered pill as the expanded desktop sidebar (never the dot).

- [ ] **Step 6: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix(inbox): address issues found during unread badge verification"
```
(Skip this step if no fixes were needed.)
