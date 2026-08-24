# Billing Subscription Lifecycle Fixes (Design)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into an implementation plan. This is real code (not docs) — the plan should follow TDD, extending the existing test file at `app/api/stripe/create-checkout/route.test.ts` and creating a new one at `app/api/account/route.test.ts`.

**Goal:** Fix two real billing bugs found during the Help-docs accuracy audit (`docs/investigations/2026-08-24-help-docs-audit-findings.md`): account deletion never cancels the deleted user's Agency's Stripe subscription, and plan upgrades create a second concurrent subscription instead of modifying the existing one.

**Architecture:** Two independent, narrowly-scoped fixes to two existing route handlers — no new files, no schema changes, no new dependencies. A read-only triage script (already merged, PR #53) confirmed zero customers are currently affected by either bug, so this is a correctness fix for future customers, not an active-incident remediation.

**Tech Stack:** Next.js Route Handlers, Prisma, Stripe SDK (`stripe` npm package, apiVersion `2026-07-29.dahlia`), Vitest.

---

## Fix 1 — Cancel the Stripe subscription on account deletion

### Current behavior (confirmed by reading the code, not assumed)

`app/api/account/route.ts`'s `DELETE` handler runs a single `prisma.$transaction` that deletes the user's owned workspaces and all their data, then deletes the `User` row. It contains zero references to Stripe anywhere in the file. The `Agency` row — which holds `stripeCustomerId` and `stripeSubId` (`prisma/schema.prisma:39-58`) — is never touched. Since `User.agencyId` has no cascade behavior and nothing else in the codebase deletes or cleans up `Agency` rows (confirmed via repo-wide search), a solo agency owner deleting their account leaves behind an orphaned `Agency` row with zero members and a live Stripe subscription that continues billing indefinitely, with nothing in LYRA's own data pointing back to "this needs to be cancelled."

### The fix

Before the existing deletion transaction runs, determine whether this user is a member of an Agency and, if so, whether they're the **last** owner-role (`AGENCY_ADMIN` or `SMB_OWNER`) member of it — an agency with other admins shouldn't lose its subscription just because one admin account is deleted. If they are the last owner-role member and the Agency has a `stripeSubId`, cancel that subscription via `stripe.subscriptions.cancel(stripeSubId)` immediately (per the approved decision: no `cancel_at_period_end`, no proration/refund — matches a user's stated intent to delete everything now). This Stripe call happens *before* the Prisma transaction starts, so a Stripe failure aborts the whole deletion cleanly rather than leaving a half-deleted account — the transaction should not proceed if the cancellation call throws.

**Determining "last owner-role member" requires one query the current handler doesn't make:** fetch the user's `Agency` (via `user.agencyId`, already available on the authenticated user object per `requireAuth`) along with a count of its members whose role is `AGENCY_ADMIN` or `SMB_OWNER`, excluding this user. If that count is 0 and `agency.stripeSubId` is set, cancel before the transaction.

**Edge case — what if `stripe.subscriptions.cancel` is called on an already-canceled subscription?** Stripe's API returns an error (`resource_missing` is for retrieval; a cancel on an already-canceled sub returns a 400). Wrap the cancel call and treat "already canceled" as a non-fatal outcome (log and continue) rather than blocking account deletion over a subscription that's already in the state we wanted it in.

### Files

- Modify: `app/api/account/route.ts` — add the Agency/subscription-cancellation step before the transaction.
- Create: `app/api/account/route.test.ts` — no test file exists for this route today. New tests needed: (a) cancels the subscription when the user is the last owner-role member with a live `stripeSubId`; (b) does NOT cancel when another owner-role member remains in the same Agency; (c) does NOT call Stripe at all when the user has no Agency or the Agency has no `stripeSubId`; (d) an already-canceled subscription doesn't block deletion; (e) a genuine Stripe API error (not "already canceled") aborts before the Prisma transaction runs, and the transaction's `deleteMany`/`delete` calls are never invoked in that case.

---

## Fix 2 — Upgrades modify the existing subscription instead of creating a new one

### Current behavior (confirmed by reading the code)

`app/api/stripe/create-checkout/route.ts`'s `POST` handler always calls `stripe.checkout.sessions.create({ mode: 'subscription', ... })`, whether the requesting agency has no subscription yet (first-time signup, correctly needs to collect a payment method) or already has one (`agency.stripeSubId` is set — an upgrade or downgrade, incorrectly creates a second concurrent subscription rather than modifying the first). The webhook handler (`app/api/stripe/webhook/route.ts:83`) derives the plan to sync from **`sub.metadata.plan`**, not from the subscription's price ID — this matters directly for the fix below.

### The fix

Branch on whether `agency.stripeSubId` is already set:

- **Not set (first subscription):** unchanged — keep creating a Checkout Session exactly as today, since a payment method still needs to be collected.
- **Set (upgrade/downgrade of an existing subscription):** instead of Checkout, call `stripe.subscriptions.retrieve(agency.stripeSubId)` to get the current subscription's first item ID, then `stripe.subscriptions.update(agency.stripeSubId, { items: [{ id: currentItemId, price: PLANS[plan].priceId }], proration_behavior: 'create_prorations', metadata: { agencyId: agency.id, plan, userId: user.id } })`. **The `metadata: { plan, ... }` on this update call is not optional** — the webhook's `.updated` handler reads `sub.metadata.plan` to decide what to sync to `agency.plan`; omitting it (or leaving stale metadata from the original subscription) would cause the webhook to either skip the sync (`toPlan` returns null, logged as an error) or worse, re-sync the *old* plan and silently undo the upgrade. Return a JSON success response (no `url` — nothing to redirect to) so the caller can show a success state directly.

**This is currently the same route as the existing Downgrade button** (`billing-client.tsx`'s "Downgrade" goes through `handleManage()` → the Stripe portal, not `create-checkout` — confirmed by reading the component). So this fix only changes the Upgrade path's behavior; Downgrade already goes through the Stripe-hosted portal and is unaffected by this change. Worth confirming this stays true (portal-based downgrades already handle proration correctly via Stripe's own UI) rather than assuming it's out of scope without checking during implementation.

### UI change required

`app/(dashboard)/account/billing/billing-client.tsx`'s `handleUpgrade` currently always does `window.location.assign(data.url)` on a successful response. It needs a second branch: when the response is `{ success: true }` (no `url`), skip the redirect, show a success toast/state, and refresh the page's plan data (e.g. `router.refresh()`) so the UI reflects the new plan without a full Stripe redirect round-trip.

### Files

- Modify: `app/api/stripe/create-checkout/route.ts` — branch on `agency.stripeSubId`, add the in-place-update path.
- Modify: `app/api/stripe/create-checkout/route.test.ts` — extend the existing test file (already mocks `prisma.agency.findFirst` and the `stripe` client in the exact shape needed) with new cases: (a) an agency with no `stripeCustomerId`/`stripeSubId` still goes through `checkout.sessions.create` unchanged (regression coverage for the existing behavior); (b) an agency with a `stripeSubId` set calls `stripe.subscriptions.retrieve` then `stripe.subscriptions.update` with the new price and `proration_behavior: 'create_prorations'`, and does NOT call `checkout.sessions.create`; (c) the `subscriptions.update` call's `metadata.plan` matches the requested plan; (d) the response for the in-place-update path has no `url` field and a success indicator.
- Modify: `app/(dashboard)/account/billing/billing-client.tsx` — add the no-redirect success branch to `handleUpgrade`.

---

## What this design deliberately does not cover

- **No remediation workflow for currently-affected customers** — the triage script (PR #53) already confirmed there are none right now. If that changes before this ships, the remediation is a manual Stripe-dashboard action per the already-existing `check-trend-subscriptions.ts` pattern (identify, then a human decides refund vs. cancel), not something this fix needs to automate.
- **No change to the downgrade flow** — it already goes through the Stripe-hosted billing portal, a separate code path unaffected by either bug.
- **No change to the Trend or Crisis Aware add-on checkout flows** (`app/api/stripe/trend-checkout/route.ts` — disabled anyway; `app/api/stripe/crisis-aware-checkout/route.ts`) — those are separate, single-item add-on subscriptions layered on top of the main plan subscription, not the plan subscription itself, and weren't found to have the same bug during the audit.
- **No new shared "subscription lifecycle" abstraction module.** Both fixes are small, targeted changes to their existing route handlers. A shared helper was considered during brainstorming but rejected as premature — two call sites don't yet justify an abstraction, and introducing one now would be scope creep beyond fixing the two confirmed bugs.

---

## Testing approach

Both routes already use (or, for `account/route.ts`, will use) Vitest with `vi.mock` for `@/lib/auth`, `@/lib/prisma`, and `@/lib/stripe` — following the exact pattern already established in `app/api/stripe/create-checkout/route.test.ts` (re-export the real `PLANS` via `vi.importActual`, mock only the `stripe` client object and the specific Prisma methods each route calls). No integration tests against real Stripe — the triage script already proved real-Stripe verification separately, and route-handler tests should stay fast and offline like their siblings.
