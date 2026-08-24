# Help-Docs Accuracy Audit & Zernio Custody Investigation (Design)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into an implementation plan. Both workstreams below are investigation/audit work (dispatch subagents, collect findings, aggregate a report) — neither produces code changes. The actual fix work for whatever each workstream finds is explicitly OUT OF SCOPE here and gets its own brainstorm once real findings exist.

**Goal:** Determine the true scope of two problems surfaced during the Metricool gap-closure roadmap's Phase 0 (PR #49): (1) whether LYRA's Help docs falsely describe LYRA as the sole custodian of social-platform OAuth tokens when the live flow actually routes through Zernio, a third party, and (2) how much of the remaining Help documentation (`components/lyra/help/*`) describes features that don't match shipped code, following the same pattern found in 3 of 13 files during Phase 0.

**Architecture:** Two independent investigation workstreams, each producing a findings report rather than code changes. Workstream 1 (token custody) runs first since it may be time-sensitive (privacy policy, Meta App Review). Workstream 2 (docs audit sweep) can run in parallel or after — it doesn't depend on Workstream 1's outcome. Both use the same subagent-dispatch pattern already proven in Phase 0: independent agents read real shipped code and cross-check specific claims, rather than skimming.

**Tech Stack:** No new dependencies. Read-only investigation against the existing Next.js/Prisma codebase, `services/social/`, `docs/legal/`, and `docs/meta-app-review-guide.md`.

---

## Why this is investigation, not implementation

Per `superpowers:brainstorming`'s decomposition guidance, this document deliberately does NOT scope the fixes for either workstream, because neither is currently understood well enough to plan safely:

- **Workstream 1**: whether there's a real compliance gap depends entirely on what LYRA's actual privacy policy already says — unknown without reading it. If it already discloses Zernio, this is a docs-correction task; if it doesn't, it's a privacy-policy and possibly Meta-App-Review-submission task, which isn't mine to decide or write unilaterally.
- **Workstream 2**: 3 of 13 Help files are known-bad in detail; 10 are unknown. Planning fixes for files that haven't been read yet would mean inventing severity and scope rather than measuring it — exactly the mistake the roadmap doc for the larger Metricool initiative avoided by treating Post Types as its own future brainstorm rather than guessing its schema now.

---

## Workstream 1 — Zernio token-custody investigation

### What triggered this

During Phase 0's code-quality review of `components/lyra/help/section-03-social-connections.tsx`, a reviewer found its opening paragraph states: *"LYRA stores only the OAuth access token — encrypted at rest using AES-256-GCM — and uses it exclusively to act on your behalf."* But the live connect flow (`app/api/social/connect/[platform]/route.ts`) routes through Zernio, a third-party social API aggregator, which creates the actual platform connection — meaning Zernio, not LYRA, holds custody of the underlying OAuth tokens for any account connected via that path. The same review found several requested permission scopes (`ads_management`, `business_management` on Facebook; `offline.access` on X) that aren't disclosed anywhere in-app.

### What gets investigated (in order — later steps depend on earlier findings)

1. **Confirm the technical facts.** Read `services/social/provider/zernio.ts`, `services/social/provider/index.ts`, and the Zernio connect/callback routes to establish precisely: what does LYRA's own database store for a Zernio-connected account (a `zernioAccountId`, confirmed from Phase 0's review — verify this holds for every platform, not just the ones already sampled)? Does LYRA ever receive or handle the raw platform token directly, even transiently? Is there a mix — some platforms still native, some Zernio — and does the custody answer differ by platform?

2. **Read LYRA's actual privacy policy.** Locate it (check `docs/legal/`, and whether it's also rendered somewhere in the live app, e.g. `/legal/privacy`) and read what it currently says about third-party sub-processors, data sharing, and social-platform credential handling. This is the single most important fact-finding step — it determines whether Workstream 1 is a "fix one wrong sentence" problem or a "the actual legal document needs a decision" problem.

3. **Complete the permission-scope audit** started in Phase 0's review — confirm the actual requested scopes for every connected platform (Facebook, Instagram, LinkedIn, TikTok, X, Google Business) against what's disclosed anywhere in-app (Help docs, any in-product consent screen LYRA itself renders before redirecting to Zernio/the platform).

4. **Check `docs/meta-app-review-guide.md`** for whether it makes representations about token custody or scope usage that would need to match whatever Workstream 1 concludes — Meta App Review is a live, active submission process, not just internal documentation.

### Deliverable

A findings memo (Markdown, not code) covering: the confirmed technical custody model per platform, whether the privacy policy already covers it, the complete undisclosed-scope list if any, and Meta App Review implications if any — ending with clearly separated options for what could change (Help doc correction only / privacy policy update needed / Meta App Review resubmission implications), explicitly not a decision on which option to take. That decision involves legal/business judgment beyond what an investigation should resolve unilaterally.

### Explicitly out of scope for this workstream

- Writing or editing the actual privacy policy text.
- Making any change to what data Zernio or LYRA actually stores (that's a vendor/architecture decision, not a docs fix).
- Resubmitting anything to Meta App Review.

---

## Workstream 2 — Help-docs audit sweep

### What triggered this

Independent Phase 0 code-quality reviews of `section-09-analytics.tsx`, `section-06-compose.tsx`, and `section-03-social-connections.tsx` each found roughly 10 additional claims per file that don't match shipped code, ranging from cosmetic (wrong button label) to a real data-loss risk (Compose's doc falsely promises 30-second auto-save; no such code exists). All three reviews independently concluded the whole `components/lyra/help/` directory reads as though it was authored from a spec and never reconciled against the product's pivot from native per-platform OAuth to routing everything through Zernio.

### Files in scope (the 10 not yet audited)

| File | Lines | Feature area to cross-check against |
|---|---|---|
| `section-01-getting-started.tsx` | 127 | Whatever onboarding flow currently exists |
| `section-02-workspaces.tsx` | 118 | Workspace creation/management routes |
| `section-04-brand-intelligence.tsx` | 210 | `services/brand-intelligence/*`, the website scraper + Claude profile builder |
| `section-05-content-calendar.tsx` | 155 | `components/lyra/calendar/*` |
| `section-07-inbox.tsx` | 215 | `components/lyra/inbox/*`, comment/response services |
| `section-08-seo.tsx` | 149 | `services/seo/*`, GSC integration |
| `section-10-settings.tsx` | 259 | `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` |
| `section-11-billing.tsx` | 235 | `lib/stripe.ts`, billing routes |
| `section-13-trends.tsx` | 22 | Trend add-on (already known disabled/placeholder elsewhere — likely a quick clean pass, not a deep one, but verify rather than assume) |
| `section-14-data-deletion.tsx` | 73 | Actual data-export/deletion capability (a prior reviewer specifically flagged this as worth checking against the disconnect-doesn't-revoke finding in section-03) |

### Method

One dispatched agent per file (matching the depth already proven in Phase 0's 3 reviews — read the actual feature code the section describes, cross-check every substantive claim, not just skim for obviously-wrong sentences). Each produces a Critical/Important/Minor findings list, same taxonomy as the 3 already-done files, with file:line citations on both the doc claim and the code it contradicts (or confirms).

`section-13-trends.tsx` gets the same treatment as the rest despite its size — "probably fine" was also the assumption going into the first 3 files, all of which turned out badly wrong.

### Deliverable

One consolidated findings report (Markdown) combining all 13 files — the 10 new audits plus a re-summary of the 3 already found during Phase 0 — sorted by severity across the whole directory, not per-file. This is the input to a future, separate brainstorm that scopes the actual fix work (which files get a full rewrite vs. a targeted patch, per the "severity-based" decision already made).

### Explicitly out of scope for this workstream

- Fixing anything found (that's the deferred future brainstorm).
- Designing a recurrence-prevention mechanism (tests, review cadence, etc.) — deliberately deferred to its own future item per the brainstorming decision, noted once in the final report rather than designed now.

---

## Sequencing

Workstream 1 runs first (time-sensitivity: privacy policy, live Meta App Review submission). Workstream 2 doesn't depend on Workstream 1's outcome and could run in parallel if preferred at execution time — that's a scheduling choice for the implementation plan, not a design constraint.
