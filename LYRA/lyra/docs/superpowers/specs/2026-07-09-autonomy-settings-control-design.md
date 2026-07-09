# Autonomy Settings Control — Design Spec

**Date:** 2026-07-09
**Priority:** —
**Status:** Approved for implementation

---

## Overview

Add a Settings-page control letting a workspace owner choose how autonomously LYRA's AI responds to comments, across three stages:

- **No reply** — AI never generates a response. Comments sit for manual handling in the Inbox.
- **Post with approval** — AI drafts a response for each comment; a human must approve it in the Inbox before it goes live.
- **Full Automatic** — AI generates and publishes a response with no human review.

This is a UI-only feature. The backing data model, the enum values, the API endpoint that persists the setting, and the worker/webhook logic that reads it at response time **all already exist** — `Workspace.aiResponseMode` (`Autonomy` enum: `OFF` | `DRAFT_APPROVE` | `FULL`) already gates exactly this behavior in `app/api/zernio/webhook/route.ts` and is already accepted by `PATCH /api/workspaces/[id]`. There is currently no UI anywhere in the app to change it — it can only be set directly in the database. This spec adds that UI.

**Naming note:** the schema already has an unrelated `Guardrail` model (per-workspace content rules like "never discuss X", "always escalate Y" — no UI yet either). To avoid confusion between the two, this feature is called "Autonomy" in code and UI copy, not "Guard Rails."

---

## Plan Gating

`FULL` is restricted to PRO and AGENCY plans — the same gating pattern already used by Crisis Aware (`components/lyra/settings/crisis-aware-toggle.tsx`). `OFF` and `DRAFT_APPROVE` are available on every plan, including Starter.

Gating is enforced in two places, matching the existing Crisis Aware pattern:
- **Client:** the "Full Automatic" option renders disabled (greyed, non-clickable) for non-Pro workspaces, with a "Requires Pro or Agency plan" note beneath it.
- **Server:** `PATCH /api/workspaces/[id]` rejects `aiResponseMode: 'FULL'` with 403 if `existing.plan === 'STARTER'`, mirroring the existing `crisisAware` plan-gate check in that same handler.

---

## Confirmation on Full Automatic

Because `FULL` publishes AI-generated replies live with no review step, selecting it opens a confirmation dialog before the change is persisted: *"AI will reply to comments publicly with no review. Continue?"* Switching to `OFF` or `DRAFT_APPROVE` applies immediately, no dialog — those are the safer directions.

Reuses the existing `AlertDialog` component (`@/components/ui/alert-dialog`) already used by `DeleteWorkspaceButton` — no new dialog primitive needed.

---

## Component: `components/lyra/settings/autonomy-selector.tsx`

Client component, following the same shape as `CrisisAwareToggle`: local optimistic state, PATCH on change, revert + inline error message on failure.

```typescript
interface AutonomySelectorProps {
  workspaceId: string
  currentMode: 'OFF' | 'DRAFT_APPROVE' | 'FULL'
  isPro: boolean
}
```

Renders three stacked, radio-style option rows inside the existing `bg-background-secondary border border-background-border rounded-xl` card pattern used throughout Settings (see `CrisisAwareToggle`, the platform cards in `settings/page.tsx`). Each row shows: a radio indicator (filled when selected), a title, and a one-line description. All three rows are always visible — no dropdown — so the current stage and its neighbors stay legible at a glance.

| Option | Title | Description |
|---|---|---|
| `OFF` | No reply | Comments aren't answered automatically. Review and respond manually in the Inbox. |
| `DRAFT_APPROVE` | Post with approval | AI drafts a reply for each comment. Nothing goes live until you approve it in the Inbox. |
| `FULL` | Full Automatic | AI replies to comments instantly with no review. |

**Click behavior:**
- Clicking the already-selected option is a no-op.
- Clicking `OFF` or `DRAFT_APPROVE` immediately fires `PATCH /api/workspaces/${workspaceId}` with `{ aiResponseMode: <mode> }`, optimistically updates local state, reverts + shows an inline error on failure (same pattern as `CrisisAwareToggle.handleToggle`).
- Clicking `FULL` (only reachable when `isPro`) opens the `AlertDialog` confirmation. Confirming fires the same PATCH; cancelling leaves the current selection untouched.
- Clicking `FULL` when `!isPro` does nothing (row is `disabled`).

---

## Settings Page Changes (`app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`)

1. Add `aiResponseMode: true` to the existing `workspace` Prisma `select` (currently `{ id, name, crisisAware, plan, timezone }`).
2. Add a new "Automation" section rendering `<AutonomySelector>`, placed after the Timezone section and before Add-ons — groups it with other workspace-behavior controls (Timezone) rather than burying it inside the Add-ons list, while still sitting immediately above the related Crisis Aware add-on.
3. `isPro` computed the same way `CrisisAwareToggle` already receives it: `workspace.plan === 'PRO' || workspace.plan === 'AGENCY'`.

---

## API Changes (`app/api/workspaces/[id]/route.ts`)

Add one plan-gate check to the existing `PATCH` handler, directly beside the existing `crisisAware` gate:

```typescript
if (aiResponseMode === 'FULL' && existing.plan === 'STARTER') {
  return NextResponse.json({ error: 'Full Automatic requires Pro or Agency plan.' }, { status: 403 })
}
```

No other backend changes — `aiResponseMode` is already accepted and persisted by this handler, and `getWorkspaceForUser` already selects `plan`.

---

## Testing

- Unit test for the new server-side gate: `PATCH` with `aiResponseMode: 'FULL'` on a `STARTER`-plan workspace returns 403; on `PRO`/`AGENCY` it succeeds.
- Manual verification (no existing test coverage for Settings page UI): confirm all three rows render and reflect the current DB value on load, confirm switching to `OFF`/`DRAFT_APPROVE` persists without a dialog, confirm switching to `FULL` on a Pro workspace shows the confirm dialog and persists on confirm, confirm the `FULL` row is disabled with the plan note on a Starter workspace.

---

## Out of Scope

- The `Guardrail` content-rule model (NEVER_DISCUSS / NEVER_USE_WORD / ALWAYS_ESCALATE / APPROVED_ANSWER) — unrelated, no UI added here.
- Per-platform autonomy (this is a single workspace-wide setting, matching the existing `aiResponseMode` field's scope).
- Billing/upgrade flow for Starter workspaces wanting Full Automatic — the disabled state links nowhere; upgrade is out of scope for this change.
