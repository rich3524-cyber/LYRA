# Crisis Aware — Email Alert — Design Spec

**Date:** 2026-07-23
**Priority:** 1
**Status:** Approved for implementation

---

## Overview

Crisis Aware's escalation today is in-app only — a red banner and auto-paused posts. There is no email, push, or SMS notification of any kind anywhere in this codebase, for any feature, confirmed while building the keyword-suggestions feature earlier the same day. If nobody has LYRA open when a crisis triggers, nobody finds out until they happen to log in. The original Crisis Aware spec (`2026-05-25-crisis-aware-design.md`) always intended an email channel ("Send via existing email infrastructure (or console.log if not wired yet)") — it just never got built. This spec closes that gap.

**Scope, explicitly narrow:** this is the Crisis Aware trigger email only. The in-app Help page describes a much broader notification system (escalated comments, failed posts, token expiry, approvals, billing) with per-event toggles — that is a separate, bigger project, deliberately deferred. Building it is out of scope here.

---

## Email Provider

**Resend.** A `RESEND_API_KEY` already exists in the LYRA app's Netlify environment (confirmed via `netlify env:list`) — likely provisioned when the marketing "Coming Soon" pages were built. Nothing in the `lyra/` codebase actually uses it yet: no `resend` npm package installed, no sending code anywhere. Reusing the existing key rather than provisioning a separate one — there's no present benefit to isolating Crisis Aware's emails into their own Resend API key at this scale (one email type, one trigger); that's easy to split out later if a real reason comes up (e.g. wanting separate analytics or rate limits per email category in Resend's dashboard).

**Sending domain:** `lyraonline.ai` is verified on the account. From address: `notifications@lyraonline.ai`, matching what the in-app Help page already documents as the established convention (even though nothing currently sends from it).

---

## Architecture

Two new files, following this codebase's existing `lib/` (thin client wrapper) vs `services/` (domain logic that uses the client) split — the same pattern `lib/anthropic.ts` / `services/ai/crisis-detector.ts` already establishes:

```
lib/resend.ts                              — Resend client singleton
services/notifications/crisis-alert-email.ts — builds + sends the crisis alert email
```

Called from **`services/ai/crisis-detector.ts`**'s `checkAndTriggerCrisis()`, immediately after the `CrisisEvent` is created in the existing `$transaction`. This is the single call site already shared by both `comment-monitor.worker.ts` (the polling cron) and `app/api/zernio/webhook/route.ts` (the real-time webhook) — no new wiring needed at either caller, and no risk of the email path drifting out of sync with one ingestion route the way earlier bugs this session did (self-comment filtering, crisis detection itself).

**Fail-open, matching every other piece of this feature:** the email send is wrapped in its own try/catch inside `crisis-alert-email.ts` and never re-throws. A failed send (bad key, Resend outage, malformed data) must never prevent the `CrisisEvent` from being recorded or `crisisActive` from being set — those are the actually load-bearing safety effects (auto-pausing posts). The email is a convenience notification layered on top, not a dependency of the crisis-handling logic itself.

---

## Recipients

Every user whose `WorkspaceAccess.role` for that workspace is `SMB_OWNER` or `AGENCY_ADMIN`:

```typescript
const owners = await prisma.workspaceAccess.findMany({
  where: { workspaceId, role: { in: ['SMB_OWNER', 'AGENCY_ADMIN'] } },
  select: { user: { select: { email: true, name: true } } },
})
```

**Why not `Workspace.ownerId`:** it exists in the schema but is never populated anywhere in the app — confirmed against real production data (the ITWM workspace has `ownerId: null`). The only reliable source of "who owns this" is the `WorkspaceAccess` role. If a workspace has multiple admins, all of them receive the alert — there's no single canonical owner field to narrow to just one, and multiple co-admins may legitimately all want to know.

If the query returns zero recipients (a workspace with no owner/admin role present — shouldn't normally happen, but not impossible), skip sending and log it. Don't error.

---

## Email Content

- **From:** `notifications@lyraonline.ai`
- **To:** every resolved recipient email, one send per recipient (not a single email with multiple `To` addresses — keeps each recipient's copy private from the others, standard practice, and Resend's API supports an array of `to` per call but batches are simpler to reason about and retry individually if ever needed)
- **Subject:** `Crisis Aware alert — {workspace.name}`
- **Body includes:**
  - What triggered it: `"3+ negative comments detected"` for `SENTIMENT_SPIKE`, or `"a comment matched an escalation keyword"` for `KEYWORD_MATCH`
  - A short excerpt of the triggering comment — the **first** entry in `result.commentIds` (for a `SENTIMENT_SPIKE` with multiple hits, showing just one representative comment keeps the email short rather than quoting three), truncated to ~150 characters, plus its platform and author name
  - A link to `${process.env.APP_BASE_URL}/workspace/{workspaceId}/inbox` — `APP_BASE_URL` is the established convention for building absolute URLs in server-side code across this codebase (onboarding links, Stripe checkout URLs, OAuth redirect URIs all use it), not the client-exposed `NEXT_PUBLIC_APP_URL`
  - A one-line note that scheduled posts are paused until resolved in-app

**No one-click resolve link.** An unauthenticated action link embedded in an email (e.g. a token-based "click here to resolve") adds real security surface — someone forwarding the email, an email client prefetching links, no session/auth context to check permissions against — for a feature that's easy enough to resolve from the in-app banner already. Resolving stays exclusively an in-app action via the existing `POST /api/crisis/resolve` flow and its Resolve button.

**Styling:** plain inline-styled HTML (no external stylesheet — most email clients strip `<style>` blocks or don't apply them reliably), system font stack (`-apple-system, Segoe UI, Roboto, sans-serif` — email clients don't reliably load custom web fonts like the app's DM Sans), light background for broad email-client compatibility (many clients render dark backgrounds inconsistently), a red/warning accent for the alert framing consistent with the in-app crisis banner's tone. Not trying to visually replicate the full LYRA dark theme — optimizing for "renders correctly and reads clearly" over brand-perfect fidelity, standard practice for transactional email.

---

## Data Flow

1. `checkAndTriggerCrisis()` detects a trigger, writes `crisisActive: true` + `CrisisEvent` in the existing transaction (unchanged).
2. Immediately after, call `sendCrisisAlertEmail(workspaceId, result)`.
3. Inside `sendCrisisAlertEmail`:
   - Fetch the workspace's name (`prisma.workspace.findUnique`, just `{ name: true }` — the caller already has `workspaceId` but not `name`).
   - Fetch the recipient list (query above).
   - Fetch the triggering comment (`result.commentIds[0]`) — `content`, `authorName`, and `socialAccount.platform`.
   - If zero recipients, log and return.
   - Build the HTML body, send one email per recipient via Resend.
   - Wrap the whole function body in try/catch; log and return on any failure, never throw.

---

## Error Handling

- Resend API failure (network error, invalid key, rate limit): caught, logged with the workspace ID and error, function returns. The crisis itself is already recorded regardless — this only affects whether the notification email goes out.
- Zero eligible recipients: logged, not treated as an error.
- Missing/malformed comment data for the excerpt (shouldn't happen given `result.commentIds[0]` always comes from a real just-detected comment, but queried defensively): if the comment lookup returns null, send the email without an excerpt rather than failing the whole send.

---

## Scope Boundaries

- Crisis Aware trigger only. No other event types (escalated comments, failed posts, token expiry, billing, etc.) — that's the separate, bigger notification-preferences project referenced in the Help page, not touched here.
- No user-facing on/off toggle for this specific email — it always fires when `crisisAware` is on and a crisis triggers, for every owner/admin. Adding a per-user notification preference is part of the deferred bigger project, not this one.
- No one-click resolve action from the email (see above).
- No retry queue on send failure — fail open, log, move on.
- No digest/batching — one email per crisis trigger, immediately (matches the existing "sends once per crisis episode" guarantee already provided by `crisisActive` short-circuiting repeat triggers within the same open crisis).
- Sentiment-spike crises still can only be detected via the polling cron, not the webhook (an existing, separate limitation noted in `crisis-detector.ts`'s own comments) — not something this email feature changes or needs to solve.

---

## Files Created / Modified

| File | Action |
|---|---|
| `package.json` | Add `resend` dependency |
| `lib/resend.ts` | New — Resend client singleton |
| `services/notifications/crisis-alert-email.ts` | New — builds + sends the crisis alert email |
| `services/ai/crisis-detector.ts` | Modified — call `sendCrisisAlertEmail` after the `CrisisEvent` transaction in `checkAndTriggerCrisis` |
