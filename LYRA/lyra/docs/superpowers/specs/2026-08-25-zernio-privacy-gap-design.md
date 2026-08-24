# Zernio Privacy-Policy Gap — Response Plan (Design)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into an implementation plan. Workstream 1 (legacy-account check) is investigation/code, plannable now. Workstream 2 (Privacy Policy draft) produces a proposed document edit, not a final publish — plannable as "draft and commit for review," not "ship." Workstream 3 (Meta App Review) produces a short question list for Richard, not code. Workstream 4 (scope re-derivation) produces a checklist for Richard; the actual doc update is explicitly a FUTURE step gated on him supplying data this pass doesn't have.

**Goal:** Respond to the confirmed finding in `docs/investigations/2026-08-24-zernio-token-custody-findings.md` — LYRA's Privacy Policy has a closed 6-party disclosure list that doesn't include Zernio, despite Zernio holding the actual OAuth tokens for every live-connected social account — across the four workstreams scoped during brainstorming.

**Architecture:** Four independent, narrow pieces of work. Only Workstream 1 is fully self-contained code. Workstreams 2–4 each terminate in a draft, a question list, or a checklist for Richard — none of them ship a final legal document or complete a fix that depends on data this pass doesn't have access to.

**Tech Stack:** Prisma (Workstream 1's query), a Next.js page component edit (Workstream 2, `app/legal/privacy/page.tsx`), plain Markdown documents (Workstreams 3 and 4's deliverables).

---

## Workstream 1 — Legacy native-provider account check

### Why

The custody investigation found LYRA's `getProvider()` dispatch (`services/social/provider/index.ts`) falls back to the native provider for any `SocialAccount` where `provider !== 'ZERNIO'` or `zernioAccountId` is null — meaning some accounts could still have LYRA itself holding the real OAuth token, not Zernio. Whether any such accounts exist in production directly affects how the Privacy Policy language should be framed (Zernio-only disclosure vs. "either Zernio or LYRA itself, depending on when you connected").

### What

A read-only script, following this repo's established one-off-script convention (`scripts/check-trend-subscriptions.ts`, `scripts/check-billing-bugs-live-impact.ts` — fresh `PrismaClient()`, no `lib/prisma.ts` import, dotenv-loaded `.env.local`):

```typescript
const legacyAccounts = await prisma.socialAccount.findMany({
  where: {
    OR: [
      { provider: { not: 'ZERNIO' } },
      { zernioAccountId: null },
    ],
  },
  select: { id: true, platform: true, provider: true, workspaceId: true, isActive: true, createdAt: true },
})
```

Report count, platform breakdown, and whether any are `isActive: true` (a genuinely live account still on native custody, vs. a dead/disconnected historical row that doesn't matter for current disclosure accuracy).

### Deliverable

Real output from running it against production data, folded into the consolidated findings doc (see "Final deliverable" below).

---

## Workstream 2 — Privacy Policy disclosure draft

### Why

`app/legal/privacy/page.tsx` Section 3 ("Disclosure of Your Information") lists exactly 6 named parties and states data isn't shared with anyone else absent legal requirement or consent. Zernio isn't listed. Two more inaccuracies live in the same document, directly adjacent to this issue and worth fixing in the same pass since they're the same class of "this document overstates LYRA's direct custody" problem:

- **Section 1** ("Social media credentials"): claims tokens are "encrypted at rest using AES-256-GCM" with no mention that most tokens today are held by Zernio, not LYRA, and LYRA never receives them at all on that path (already confirmed by the custody investigation). Also lists platforms without YouTube, which is a live, connectable platform.
- **Section 5** ("Data Retention"): claims "Social media access tokens are deleted immediately" on disconnect — already confirmed false by the Help-docs audit (`docs/investigations/2026-08-24-help-docs-audit-findings.md`, section-03 and section-14 findings): disconnect only sets `isActive: false`, the encrypted token row is retained.

### What

I draft proposed replacement text for the three affected spots (Section 1's credential description, Section 3's disclosure list, Section 5's retention claim), matching the existing document's tone, structure, and level of formality — as a **draft for review**, not final copy. The draft:
- Adds Zernio as a named party in Section 3's list, describing what it does (facilitates the actual social-platform connections and holds the underlying OAuth credentials on LYRA's behalf) — framed accurately but neutrally, not alarmingly.
- Corrects Section 1 to describe the *current* custody split honestly (Zernio holds the token for platform-connected accounts; LYRA holds and encrypts it directly only for accounts still on the legacy native path, if Workstream 1 finds any) — the exact wording depends on Workstream 1's result, so this task is sequenced after it.
- Removes or qualifies Section 5's "deleted immediately" claim to match actual disconnect behavior.
- Adds YouTube to Section 1's platform list.

### Deliverable

A committed draft edit to `app/legal/privacy/page.tsx` on a branch/PR, explicitly labeled in the PR description as "draft for legal/Richard review, not auto-merge-and-ship" — this is the one piece of this plan where the PR itself should NOT be presented as "ready to merge" the way every other PR this session has been. Richard reviews the actual wording (and decides whether to route it through an actual lawyer) before it goes live.

---

## Workstream 3 — Meta App Review status: investigate, then produce a question list

### Why

`docs/platform-review/meta-app-review-guide.md` assumes LYRA's own dormant Facebook app is the one under review. Richard wants to know whether Zernio's own Meta app is already sufficiently approved before deciding whether LYRA's own review is still worth pursuing — but that's Zernio-account-holder information, not something derivable from this codebase.

### What

Confirmed during design: a search of `services/social/zernio-client.ts` (the full Zernio API client) and the rest of the codebase found no endpoint or stored data related to Zernio's own app-review or Meta Live-Mode status — this genuinely isn't answerable from the code. So this workstream's deliverable is a short, specific list of questions for Richard to take to Zernio (support, account rep, or their own dashboard):

1. Is Zernio's Meta app in Live Mode (not just Development Mode) for the Facebook/Instagram permissions LYRA actually uses (`pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, at minimum)?
2. Does that approval cover LYRA's specific use case, or is it a generic aggregator-level approval that doesn't guarantee LYRA's own features (e.g. comment auto-response) are covered?
3. If Zernio's Meta app were ever suspended or de-authorized by Meta, what's LYRA's exposure — does LYRA have any fallback, or does every connected Facebook/Instagram account stop working simultaneously?

### Deliverable

The question list above, included in the consolidated findings doc, explicitly flagged as "needs Richard to ask Zernio directly — not resolvable from this codebase."

---

## Workstream 4 — Permission-scope re-derivation: checklist for Richard, not the fix itself

### Why

The actual OAuth scopes granted today are configured entirely in Zernio's own per-platform app settings, invisible to this codebase (`services/social/*.ts`'s native scope lists are dead code, unreachable from any live connect path). The Help-docs audit already corrected the *known-wrong* claims; this workstream is about getting the *actually-right* numbers, which requires Richard's access.

### What

A precise checklist of what to pull from Zernio, one row per platform LYRA connects (Facebook, Instagram, LinkedIn, Google Business, X/Twitter, TikTok, YouTube):
- The exact scope/permission list Zernio's app requests for that platform (from Zernio's dashboard if it exposes this, or by triggering a real connect flow and reading the platform's own consent screen).
- Whether Zernio's app is in production/live mode for that platform specifically (some platforms' review processes are per-permission, not all-or-nothing).

### Deliverable

The checklist, included in the consolidated findings doc. The actual Help-doc/Privacy-Policy update using real data is explicitly **out of scope for this pass** — it happens in a follow-up once Richard supplies the real scope list.

---

## Final deliverable

One consolidated Markdown report (`docs/investigations/2026-08-25-zernio-privacy-response.md`, matching the existing `docs/investigations/` convention from the two prior findings reports) combining: Workstream 1's real script output, a summary of Workstream 2's draft PR (link, not the full diff), Workstream 3's investigation result + question list, and Workstream 4's checklist — plus a short "what Richard needs to do next" section listing the concrete manual actions (review/finalize the Privacy Policy draft; ask Zernio the 3 questions; pull the per-platform scope data) that this pass cannot complete on its own.

## What this design deliberately does not do

- Does not publish final Privacy Policy text — Workstream 2 produces a draft PR explicitly marked as needing Richard's/legal's review, breaking this session's usual "CI green, ready to merge" pattern on purpose.
- Does not attempt to determine Zernio's Meta App Review status by any means other than asking — no scraping, no guessing from indirect signals.
- Does not update the Help doc's permission-scope table with real numbers — that's explicitly deferred pending Workstream 4's checklist being filled in by Richard.
- Does not decide whether LYRA should keep or retire its own Meta App Review effort — that decision needs Workstream 3's answers first, and belongs to Richard.
