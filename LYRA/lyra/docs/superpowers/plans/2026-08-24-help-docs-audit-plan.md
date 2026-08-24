# Help-Docs Audit & Zernio Custody Investigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task in this plan produces a findings report, not a code change — there is no TDD red/green cycle here; "testing" a task means verifying the dispatched agent's report is complete, well-cited, and actually answers what was asked, which is done via the same spec-compliance + code-quality review pattern used for Phase 0 (the "quality" reviewer here checks investigation rigor, not code correctness).

**Goal:** Produce two findings reports — Zernio token-custody facts (with clearly separated options, no decision made) and a consolidated Help-docs accuracy audit across all 13 `components/lyra/help/` files — per `docs/superpowers/specs/2026-08-24-help-docs-audit-design.md`.

**Architecture:** Workstream 1 is a single dispatched investigator covering 4 independent research angles in one pass. Workstream 2 is 10 parallel dispatched reviewers (one per unaudited file) plus an aggregation step folding in the 3 files already audited during Phase 0. Both produce Markdown reports under a new `docs/investigations/` directory, committed via a branch + PR per this project's convention.

**Tech Stack:** No app code touched. Agent-tool dispatches reading the existing Next.js/Prisma codebase, `docs/legal/`, and `docs/meta-app-review-guide.md`; Markdown report files.

---

## Task 1: Create the branch

**Files:** none (git operation only)

- [ ] **Step 1: Create and switch to the branch**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
git checkout main
git pull origin main
git checkout -b docs/help-audit-findings
```

Expected: branch created from up-to-date `main` (should include PR #49 and #50's merges).

---

## Task 2: Dispatch the Zernio token-custody investigation

**Files:**
- Create: `docs/investigations/2026-08-24-zernio-token-custody-findings.md`

- [ ] **Step 1: Dispatch the investigator agent**

Use the Agent tool (`subagent_type: general-purpose`, run in foreground — the next step needs its result) with this exact prompt:

```
You are investigating a potential privacy/compliance gap in LYRA (a Next.js social-media-scheduling SaaS). Working directory: `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra`. This is a READ-ONLY investigation — do not modify any files.

## Background

LYRA's in-app Help documentation (`components/lyra/help/section-03-social-connections.tsx`) states: "LYRA stores only the OAuth access token — encrypted at rest using AES-256-GCM — and uses it exclusively to act on your behalf." But LYRA's live social-connect flow routes through Zernio, a third-party social API aggregator (confirmed: `app/api/social/connect/[platform]/route.ts` creates a Zernio profile and redirects to `zernioClient.getConnectUrl(...)`, never touching LYRA's own native OAuth code for newly-connected accounts). This means Zernio — not LYRA — may hold custody of the actual platform OAuth tokens, which the Help doc doesn't disclose. A prior code review also found several requested permission scopes that don't match what's documented anywhere in-app (Facebook requests `business_management` and `ads_management`, undisclosed; LinkedIn's actual third scope is broader than documented; TikTok's actual scopes are entirely different from documented; X requests `offline.access`, undisclosed).

## What to investigate, in order

**1. Confirm the technical custody facts.** Read `services/social/provider/zernio.ts`, `services/social/provider/index.ts`, and the Zernio connect/callback routes (find them — likely under `app/api/social/` or a dedicated `app/api/zernio/` path, and `services/social/zernio-connect.ts` if it exists). Establish precisely: what does LYRA's own database store for a Zernio-connected account (a `zernioAccountId`, per the prior review — verify this holds for EVERY platform routed through Zernio, not just the one sampled)? Does LYRA's code ever receive, log, or transiently handle the raw platform OAuth token itself anywhere in the Zernio flow? Are there still any platforms using LYRA's own native OAuth (check `services/social/*.ts` files like `facebook.ts`, `linkedin.ts`, `tiktok.ts`, `twitter.ts`, `google-business.ts` for whether their `getAuthUrl`/token-exchange functions have any live caller left, or are dead code) — if so, the custody answer differs by platform and you must report that split explicitly, not average it into one answer.

**2. Locate and read LYRA's actual privacy policy.** Check `docs/legal/` for a source document, and check whether there's a live rendered page (likely `app/legal/privacy/page.tsx` or similar — search for it). Read what it currently says, if anything, about third-party sub-processors, data sharing with vendors, or how social-platform credentials are handled. This is the single most important finding — report the exact relevant text verbatim (quote it), not a paraphrase, and clearly state whether it already discloses Zernio (or a generic "third-party service providers" clause that might cover it) or says nothing on the topic at all.

**3. Complete the permission-scope audit.** For each of Facebook, Instagram, LinkedIn, TikTok, X, and Google Business, determine the actual list of OAuth scopes requested today (check both the native `services/social/*.ts` `getAuthUrl` functions AND whatever LYRA might pass to or receive from Zernio for scope configuration — if Zernio manages scopes on its own dashboard rather than LYRA's code specifying them, say so explicitly, since that changes what's even auditable from this codebase). Cross-reference against every place in the app that discloses permissions to a user (Help docs, any consent/pre-connect screen LYRA itself renders before redirecting to Zernio or a platform — e.g. check `components/lyra/settings/facebook-connect-button.tsx` and similar). Produce a table: platform | scopes actually requested | scopes disclosed in-app | gap.

**4. Check `docs/meta-app-review-guide.md`** (read it in full) for any representations about token custody, data handling, or scope usage. Report whether anything in it would need to change based on findings 1-3, or whether it's silent on this and therefore unaffected.

## What NOT to do

Do not write or suggest specific privacy-policy replacement text. Do not propose an architecture change to what Zernio or LYRA stores. Do not make a recommendation on which "option" to pursue. This is fact-finding only — the decision belongs to the business/legal owner, not to this investigation.

## Deliverable

Write your complete findings as a Markdown report with these sections: "Technical custody facts" (per-platform if it differs), "Privacy policy — current state" (verbatim quotes), "Permission scope audit" (the table), "Meta App Review guide — relevant excerpts and whether affected", and a final "Options" section that lays out 2-4 possible paths forward as neutral, clearly-labeled options (e.g. "Option A: correct only the Help doc wording, no other gap exists" / "Option B: privacy policy needs an explicit third-party sub-processor disclosure" / "Option C: ...") without picking one. Return this Markdown as your final message text — the coordinator will save it to a file.

Report your status as DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED at the start of your response, then the full report.
```

- [ ] **Step 2: Save the returned report**

Take the agent's returned Markdown findings (everything after its status line) and write it to `docs/investigations/2026-08-24-zernio-token-custody-findings.md`, prefixed with this header:

```markdown
# Zernio Token-Custody Investigation — Findings

**Date:** 24 Aug 2026
**Trigger:** Found during Phase 0 code-quality review of `components/lyra/help/section-03-social-connections.tsx` (Metricool gap-closure roadmap, PR #49).
**Status:** Fact-finding only — no decision made here. See "Options" section at the end.

---

```

Then append the agent's full returned report content below that header.

- [ ] **Step 3: Verify the file was written correctly**

```bash
head -20 docs/investigations/2026-08-24-zernio-token-custody-findings.md
wc -l docs/investigations/2026-08-24-zernio-token-custody-findings.md
```

Expected: header present, substantial content (the report should be at minimum ~50 lines given 4 research angles each needing citations).

---

## Task 3: Dispatch the 10 Help-docs audit reviewers (parallel)

**Files:** none yet (results collected in Task 4)

Dispatch all 10 of the following as separate Agent tool calls **in a single message** (parallel — these are independent read-only reviews of different files, no shared state, matching how Phase 0's per-commit reviews were dispatched one at a time but these have no commit dependency between them so parallel is safe and faster). Use `subagent_type: code-documentation:code-reviewer` for all 10, matching the depth already proven in Phase 0.

- [ ] **Step 1: Dispatch reviewer for `section-01-getting-started.tsx`**

```
Audit `components/lyra/help/section-01-getting-started.tsx` (127 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff — there is no commit to review, just the file's claims versus reality.

Context: three other Help doc files (section-09-analytics.tsx, section-06-compose.tsx, section-03-social-connections.tsx) were each independently found to have roughly 10 claims describing features that don't match shipped code, ranging from cosmetic (wrong button label) to a real data-loss risk (a false auto-save promise) to a privacy-relevant claim (wrong description of who holds OAuth tokens). Match that same depth here: read every substantive claim in this file, then read the actual onboarding flow it describes (search for the real onboarding/getting-started implementation — check `app/onboard/`, `app/(dashboard)/workspace/[workspaceId]/layout.tsx` for any setup-checklist logic, and any "getting started" or setup-checklist component under `components/lyra/`) and cross-check every claim against it. Do not skim — read the actual implementation code for each claim before deciding it's accurate or not.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, you don't need to report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary (e.g. "3 Critical, 5 Important, 2 Minor" or "Clean — no findings").
```

- [ ] **Step 2: Dispatch reviewer for `section-02-workspaces.tsx`**

```
Audit `components/lyra/help/section-02-workspaces.tsx` (118 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: three other Help doc files were each independently found to have roughly 10 claims describing features that don't match shipped code. Match that same depth: read every substantive claim in this file, then read the actual workspace creation/management code (search for workspace CRUD routes under `app/api/workspaces/`, the workspace settings page, and any workspace-switcher component under `components/lyra/app-shell/workspace-switcher.tsx`) and cross-check every claim against it.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

- [ ] **Step 3: Dispatch reviewer for `section-04-brand-intelligence.tsx`**

```
Audit `components/lyra/help/section-04-brand-intelligence.tsx` (210 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: three other Help doc files were each independently found to have roughly 10 claims describing features that don't match shipped code. Match that same depth: read every substantive claim in this file, then read the actual Brand Intelligence implementation (search under `services/brand-intelligence/` or similar for the website scraper and the Claude-based brand profile builder, and the brand page component under `components/lyra/brand/`) and cross-check every claim against it, including any claim about refresh cadence, what data sources feed the profile, and what downstream features consume it.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

- [ ] **Step 4: Dispatch reviewer for `section-05-content-calendar.tsx`**

```
Audit `components/lyra/help/section-05-content-calendar.tsx` (155 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: three other Help doc files were each independently found to have roughly 10 claims describing features that don't match shipped code. Match that same depth: read every substantive claim in this file, then read the actual calendar implementation (`components/lyra/calendar/*` — the monthly grid, drag-and-drop rescheduling via @dnd-kit, the AI schedule generator, the bulk-import entry point) and cross-check every claim against it.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

- [ ] **Step 5: Dispatch reviewer for `section-07-inbox.tsx`**

```
Audit `components/lyra/help/section-07-inbox.tsx` (215 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: three other Help doc files were each independently found to have roughly 10 claims describing features that don't match shipped code. Match that same depth: read every substantive claim in this file, then read the actual inbox implementation (`components/lyra/inbox/*`, the comment-sync route(s), the AI response-drafting/autonomy-mode logic, guardrail types, and the Crisis Aware trigger logic) and cross-check every claim against it — this file is likely to describe the three autonomy modes, guardrails (never-discuss, banned words, always-escalate, approved answers), and Crisis Aware in detail, so check each of those specifically against the real implementation, not just the general prose.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

- [ ] **Step 6: Dispatch reviewer for `section-08-seo.tsx`**

```
Audit `components/lyra/help/section-08-seo.tsx` (149 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: three other Help doc files were each independently found to have roughly 10 claims describing features that don't match shipped code. Match that same depth: read every substantive claim in this file, then read the actual SEO module implementation (search under `services/seo/` for the Google Search Console OAuth integration, the tracked-pages manager, the on-page analyser, and the AI SEO content generator) and cross-check every claim against it.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

- [ ] **Step 7: Dispatch reviewer for `section-10-settings.tsx`**

```
Audit `components/lyra/help/section-10-settings.tsx` (259 lines, the largest Help file) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: three other Help doc files were each independently found to have roughly 10 claims describing features that don't match shipped code — one of which (section-03-social-connections.tsx) is very likely to overlap with this file's subject matter, since account connect/disconnect UI lives in Settings. Match that same depth: read every substantive claim in this file, then read the actual settings page implementation (`app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — read the WHOLE file, it's long) and cross-check every claim against it. Pay particular attention to any claims about disconnecting accounts, data retention/token revocation on disconnect, and team/member management UI (a prior audit found LYRA currently has NO team-invitation UI at all — only a direct database insert — so any claim in this file suggesting one exists would be a Critical finding).

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

- [ ] **Step 8: Dispatch reviewer for `section-11-billing.tsx`**

```
Audit `components/lyra/help/section-11-billing.tsx` (235 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: three other Help doc files were each independently found to have roughly 10 claims describing features that don't match shipped code. Match that same depth: read every substantive claim in this file, then read the actual billing implementation (`lib/stripe.ts` for plan/price definitions, the checkout routes under `app/api/stripe/`, and the Stripe webhook handler) and cross-check every claim against it — including plan names, prices, what's included per plan, and how upgrades/downgrades/cancellations actually work. Note: a separate investigation is checking whether LYRA's Stripe prices are actually in AUD or USD (undetermined from the code) — if this Help file states a specific currency, flag that as a finding regardless, since it may be asserting something the code itself can't confirm.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it. If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

- [ ] **Step 9: Dispatch reviewer for `section-13-trends.tsx`**

```
Audit `components/lyra/help/section-13-trends.tsx` (only 22 lines — the smallest Help file) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: LYRA's Trend add-on was never fully built — its checkout route (`app/api/stripe/trend-checkout/route.ts`) now returns 503, and other product surfaces (the Trend Hub component, the sales Demo Guide) have already been corrected elsewhere to say "not yet available." This file's small size makes it tempting to assume it's already fine, but that same assumption was wrong for all 3 files already audited in this project — verify rather than assume. Read the file, then confirm it accurately says the feature is unavailable/not yet shipped (matching the pattern already used in `components/lyra/trends/trend-hub.tsx` and the Demo Guide's corrected Trend Hub entries) rather than describing Trend features as if they work.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code (or absence of code) that contradicts or confirms it. If the whole file is accurate, say so clearly.

End your report with a one-line severity summary.
```

- [ ] **Step 10: Dispatch reviewer for `section-14-data-deletion.tsx`**

```
Audit `components/lyra/help/section-14-data-deletion.tsx` (73 lines) in the LYRA codebase at `C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra` for factual accuracy against shipped code. This is a read-only investigation, not a code review of a diff.

Context: a prior audit of `section-03-social-connections.tsx` found its disconnect flow claims "immediately revokes LYRA's stored access token" when the actual code only sets `isActive: false` — the encrypted token row is retained in the database, nothing is deleted. That reviewer specifically flagged this file as worth checking for the same over-claiming pattern, since it's specifically about data deletion. Read every substantive claim in this file, then read the actual data-export/deletion capability (search for any GDPR-related export/deletion routes or admin tooling — a prior Wishlist audit noted "a manual, email-request-based deletion process exists, but no self-service ZIP export or automated purge" as of 29 Jul 2026, so specifically check whether this file's claims match that reality or oversell a self-service capability that doesn't exist) and cross-check every claim against it.

Report findings as Critical/Important/Minor, each with a file:line citation on the doc's claim AND a file:line citation on the code that contradicts or confirms it (or a citation showing NO such code/route exists, if the doc claims a self-service capability that isn't there). If a claim is accurate, don't report it — only report gaps. If the whole file is accurate, say so clearly with a brief note on what you checked.

End your report with a one-line severity summary.
```

---

## Task 4: Aggregate all 13 files' findings into one consolidated report

**Files:**
- Create: `docs/investigations/2026-08-24-help-docs-audit-findings.md`

- [ ] **Step 1: Collect the 3 already-known findings from Phase 0**

These came from code-quality reviews during Phase 0 (Metricool gap-closure roadmap, PR #49) and are already in this conversation's history — re-summarize them (don't re-dispatch, they were already thorough):

- `section-09-analytics.tsx` — roughly 10 findings, including fabricated interactive features (click-to-drill-down panels that don't exist), wrong period options (documented 7d/28d/3mo/6mo/12mo/custom vs. actual 7d/30d/90d), an invented "last sync" timestamp display, and a metric list mismatch (Impressions/Engagements/Engagement Rate documented but not shown; Total Views/Response Rate shown but undocumented).
- `section-06-compose.tsx` — roughly 11 findings, most severely: a false per-platform-caption-customization claim (only one shared editor exists), a fabricated 4-step AI variations/regenerate/refine workflow (reality: one button, one generated caption, no variations), a fabricated hashtag-suggestion feature (doesn't exist anywhere), and **a false auto-save-every-30-seconds claim — the single highest-risk finding across all files audited so far, since a user trusting it could lose real work**.
- `section-03-social-connections.tsx` — roughly 11 findings, most severely: the Zernio token-custody claim (separately being investigated as Workstream 1, still list it here for completeness), an inverted description of the Instagram/Facebook connect order, a missing platform (YouTube isn't listed despite being fully shipped), a wrong disconnect-flow claim (says tokens are revoked; they're only marked inactive), and undisclosed permission scopes across most platforms.

- [ ] **Step 2: Take the 10 new reports from Task 3 and combine everything**

Write `docs/investigations/2026-08-24-help-docs-audit-findings.md` with this structure:

```markdown
# Help-Docs Accuracy Audit — Consolidated Findings

**Date:** 24 Aug 2026
**Scope:** All 13 files in `components/lyra/help/`. 3 audited during Phase 0 of the Metricool gap-closure roadmap (PR #49); 10 audited in this pass.
**Purpose:** Fact-finding only — this report does not fix anything. Fix work (patch vs. rewrite, per file, per severity) is scoped in a separate future brainstorm per `docs/superpowers/specs/2026-08-24-help-docs-audit-design.md`.

---

## Severity summary across all 13 files

| File | Critical | Important | Minor | Notes |
|---|---|---|---|---|
| section-01-getting-started.tsx | [fill from Task 3 Step 1 result] | | | |
| section-02-workspaces.tsx | [fill from Task 3 Step 2 result] | | | |
| section-03-social-connections.tsx | ~2 | ~4 | ~5 | Phase 0 (PR #49) — includes the Zernio custody finding, tracked separately |
| section-04-brand-intelligence.tsx | [fill from Task 3 Step 3 result] | | | |
| section-05-content-calendar.tsx | [fill from Task 3 Step 4 result] | | | |
| section-06-compose.tsx | ~5 | ~3 | ~3 | Phase 0 (PR #49) — includes the false auto-save claim (highest risk found to date) |
| section-07-inbox.tsx | [fill from Task 3 Step 5 result] | | | |
| section-08-seo.tsx | [fill from Task 3 Step 6 result] | | | |
| section-09-analytics.tsx | ~2 | ~8 | ~1 | Phase 0 (PR #49) |
| section-10-settings.tsx | [fill from Task 3 Step 7 result] | | | |
| section-11-billing.tsx | [fill from Task 3 Step 8 result] | | | |
| section-13-trends.tsx | [fill from Task 3 Step 9 result] | | | |
| section-14-data-deletion.tsx | [fill from Task 3 Step 10 result] | | | |

*(Fill the bracketed placeholders with each dispatched reviewer's actual one-line severity summary from Task 3 before treating this table as final — do not leave them as literal bracket text in the committed file.)*

## Full findings by file

### section-01-getting-started.tsx
[paste that reviewer's full findings here]

### section-02-workspaces.tsx
[paste that reviewer's full findings here]

### section-03-social-connections.tsx (Phase 0, PR #49)
[paste the Phase 0 findings summarized in Task 4 Step 1 — expand to the full original findings text from this conversation's history, not just the short summary]

### section-04-brand-intelligence.tsx
[paste that reviewer's full findings here]

### section-05-content-calendar.tsx
[paste that reviewer's full findings here]

### section-06-compose.tsx (Phase 0, PR #49)
[paste the Phase 0 findings summarized in Task 4 Step 1 — expand to the full original findings text from this conversation's history, not just the short summary]

### section-07-inbox.tsx
[paste that reviewer's full findings here]

### section-08-seo.tsx
[paste that reviewer's full findings here]

### section-09-analytics.tsx (Phase 0, PR #49)
[paste the Phase 0 findings summarized in Task 4 Step 1 — expand to the full original findings text from this conversation's history, not just the short summary]

### section-10-settings.tsx
[paste that reviewer's full findings here]

### section-11-billing.tsx
[paste that reviewer's full findings here]

### section-13-trends.tsx
[paste that reviewer's full findings here]

### section-14-data-deletion.tsx
[paste that reviewer's full findings here]

## Cross-file patterns worth noting

Summarize anything that recurs across 3+ files (e.g. if multiple files independently claim capabilities tied to the same non-existent feature, or if multiple files have the same category of drift — this helps the future fix-planning brainstorm decide whether some fixes can be batched).

## Recurrence prevention (noted, not designed)

Per the design doc's explicit scope decision, this report does NOT design a mechanism to prevent this drift recurring (tests, review cadence, etc.) — that's a separate future item. Noting it here once so it isn't lost: [one sentence flagging it for a future brainstorm].
```

Replace every bracketed placeholder with real content from the actual dispatched reports (Task 3) and this conversation's history (the 3 Phase 0 files) before treating this file as done — an implementer executing this task must not leave literal `[fill from ...]` text in the committed file. This is the one step in this plan where "the content" is "whatever the dispatched agents actually returned," which is why it's described as an assembly instruction rather than literal final text — unlike every other step in this plan, which does contain complete final text.

- [ ] **Step 3: Verify the aggregated file**

```bash
grep -c "\[fill from\|\[paste" docs/investigations/2026-08-24-help-docs-audit-findings.md
```

Expected: `0` — if this returns anything greater than 0, the aggregation in Step 2 is incomplete; go back and fill in the actual content before proceeding.

```bash
wc -l docs/investigations/2026-08-24-help-docs-audit-findings.md
```

Expected: substantial (likely 300+ lines given 13 files' worth of detailed findings).

---

## Task 5: Commit both reports, push, open the PR

**Files:** none (git and gh operations only)

- [ ] **Step 1: Stage and commit both reports**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
git add docs/investigations/2026-08-24-zernio-token-custody-findings.md
git add docs/investigations/2026-08-24-help-docs-audit-findings.md
git commit -m "$(cat <<'EOF'
docs: add Zernio token-custody and Help-docs audit findings

Two investigation reports per docs/superpowers/specs/2026-08-24-help-docs-audit-design.md:
- Zernio token-custody facts, privacy-policy current state, and a complete
  permission-scope gap table, with options laid out but no decision made.
- Consolidated Help-docs accuracy audit across all 13 components/lyra/help/
  files (10 newly audited + 3 from Phase 0/PR #49), severity-ranked.

Neither report changes any code or policy text -- both are fact-finding
inputs to a separate future brainstorm that scopes the actual fix work.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin docs/help-audit-findings
```

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" pr create --repo rich3524-cyber/LYRA --base main --head docs/help-audit-findings \
  --title "docs: Zernio custody + Help-docs audit findings" \
  --body "Two investigation reports per docs/superpowers/specs/2026-08-24-help-docs-audit-design.md — Zernio token-custody facts (options laid out, no decision made) and a consolidated 13-file Help-docs accuracy audit. Docs-only, no code changes. Fix work for either is explicitly out of scope here, deferred to a future brainstorm once these findings are reviewed."
```

- [ ] **Step 3: Report both file paths and a one-paragraph summary of the headline findings to Richard**

This is the actual deliverable of this whole plan — make sure the final report to the user leads with:
1. Whether Workstream 1 found a real compliance gap or just a wrong sentence (the single most important yes/no from the whole investigation).
2. The total Critical-severity count across all 13 Help files, and which 2-3 files are worst.
3. The PR link, and that no code or policy was changed — this is 100% findings, nothing has shipped yet.
