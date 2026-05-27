# Crisis Aware — Design Spec

**Date:** 2026-05-25  
**Priority:** 1  
**Status:** Approved for implementation

---

## Overview

Crisis Aware is an optional add-on that monitors incoming comments for sentiment crises. When triggered, it auto-pauses all scheduled posts for the workspace and alerts the user. The user resolves the crisis manually, which resumes scheduling.

**Product name:** Crisis Aware  
**Billing:** $10/month add-on. Available on PRO and AGENCY plans only. Starter cannot purchase it.  
**Gate:** `workspace.crisisAware: boolean` — set by billing webhook when add-on is purchased.

---

## Trigger Conditions

A crisis is detected when either condition is met within a single comment-monitor batch:

1. **Sentiment spike:** 3 or more comments in the batch score below -0.6 on Claude's sentiment scale (-1 to +1)
2. **Keyword match:** Any comment contains a word from the workspace's `Guardrail` entries with type `ALWAYS_ESCALATE`

Claude evaluates sentiment in a single batch call: pass all new comments as a JSON array, receive back `{id, score}[]`. No per-comment round trips.

---

## Data Model Changes

```prisma
model Workspace {
  // existing fields ...
  crisisAware       Boolean   @default(false)
  crisisActive      Boolean   @default(false)
  crisisTriggeredAt DateTime?
}

model CrisisEvent {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  triggeredAt DateTime  @default(now())
  resolvedAt  DateTime?
  triggerType String    // "SENTIMENT_SPIKE" | "KEYWORD_MATCH"
  commentIds  String[]  // IDs of comments that triggered it
}
```

---

## Worker Flow

In `comment-monitor.worker.ts`, after comments are fetched and saved:

1. Check `workspace.crisisAware` — skip if false
2. Check `workspace.crisisActive` — skip if already in crisis
3. Run `detectCrisis(workspaceId, newComments)` from new `services/ai/crisis-detector.ts`
4. If crisis detected: set `crisisActive = true`, `crisisTriggeredAt = now()`, create `CrisisEvent`, send alert

---

## Crisis Detector Service (`services/ai/crisis-detector.ts`)

```typescript
export async function detectCrisis(
  workspaceId: string,
  comments: { id: string; content: string }[]
): Promise<{ triggered: boolean; type?: string; commentIds?: string[] }>
```

- Fetches `ALWAYS_ESCALATE` guardrails for the workspace
- Keyword check first (no Claude call needed if match found)
- If no keyword match, calls Claude with all comment content in one batch
- Returns trigger result

---

## API Endpoints

### `POST /api/crisis/resolve`
- Auth: `requireAuth()` + workspace access check
- Body: `{ workspaceId: string }`
- Sets `crisisActive = false`, `crisisTriggeredAt = null`, sets `resolvedAt` on latest open `CrisisEvent`
- Returns `{ ok: true }`

### `GET /api/crisis/status?workspaceId=`
- Returns `{ crisisActive: boolean, crisisTriggeredAt: string | null }`

---

## Post Auto-Pause

When `crisisActive = true`:
- `post-publisher.worker.ts` checks `workspace.crisisActive` before publishing any post
- If active, logs skip reason and does NOT publish (does not set `FAILED` — post stays `SCHEDULED`)
- `POST /api/posts` continues to accept new DRAFT posts (user can still compose, just not auto-publish)

---

## Alerts

Two channels when crisis triggers:

1. **In-app:** A persistent banner on the workspace header: "Crisis detected. Scheduled posts paused. [View & Resolve]"
2. **Email:** Send via existing email infrastructure (or console.log if not wired yet) — "Crisis detected on [workspace]"

---

## UI Components

### Crisis Banner (`components/lyra/crisis/crisis-banner.tsx`)
- Shown on workspace layout when `crisisActive = true`
- Red background-border-mid border, `status-error` text
- "Crisis detected — scheduled posts paused." + "Resolve" button
- Resolve button calls `POST /api/crisis/resolve`, then refreshes workspace data

### Settings Toggle (`components/lyra/settings/crisis-aware-toggle.tsx`)
- In workspace settings, under a new "Add-ons" section
- Shows "Crisis Aware" with toggle — gated by plan (greyed out on Starter)
- For now: toggle updates `crisisAware` directly via `PATCH /api/workspaces/[id]` (Stripe wiring is Phase 2)

---

## Scope Boundaries

- No SMS/push notifications in this version — email + in-app only
- No per-platform crisis granularity — crisis affects the whole workspace
- No adjustable sentiment threshold in this version — fixed at -0.6
- No crisis history page — just the `CrisisEvent` record in DB
- Stripe billing wiring for the add-on is a separate task (not in this spec)

---

## Files Created / Modified

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `crisisAware`, `crisisActive`, `crisisTriggeredAt` to Workspace; add `CrisisEvent` model |
| `services/ai/crisis-detector.ts` | New — sentiment analysis + keyword check |
| `workers/comment-monitor.worker.ts` | Modified — call crisis detector after comment save |
| `workers/post-publisher.worker.ts` | Modified — check `crisisActive` before publishing |
| `app/api/crisis/resolve/route.ts` | New |
| `app/api/crisis/status/route.ts` | New |
| `app/api/workspaces/[id]/route.ts` | Modified — allow `PATCH crisisAware` |
| `components/lyra/crisis/crisis-banner.tsx` | New |
| `app/(dashboard)/workspace/[workspaceId]/layout.tsx` | Modified — render crisis banner |
