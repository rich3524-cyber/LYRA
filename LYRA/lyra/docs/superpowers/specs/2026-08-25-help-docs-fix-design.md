# Help-Docs Fix Pass (Design)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into an implementation plan. This is content/documentation work (Next.js JSX component rewrites, not application logic) — plans should specify `tsc`/build verification per task, not unit tests. Task 0 (shared facts) must complete and be included verbatim in every later implementer's prompt before any wave-1-4 rewrite is dispatched.

**Goal:** Fix all findings across all 13 Help-doc files that still have unfixed findings, per `docs/investigations/2026-08-24-help-docs-audit-findings.md` — the 10 files the fuller audit newly covered, plus `section-03-social-connections.tsx`, `section-06-compose.tsx`, and `section-09-analytics.tsx` (the 3 "Phase 0" files, PR #49), each of which only had its original narrow triggering claim fixed and still carries the rest of its findings from the fuller audit. `section-13-trends.tsx` (0 Critical, 2 findings total) gets a one-line patch rather than a rewrite.

**Architecture:** One prep task (verify and consolidate the audit's already-identified cross-file repeated facts into a single reference block, plus apply the one-line Trends patch), then 12 file rewrites executed in 4 review-gated waves of 3 (worst-first by total finding count across all 13 files), then one holistic wrap-up pass and a single PR for all 13 files.

**Tech Stack:** Next.js JSX components (`components/lyra/help/section-*.tsx`), the existing shared `components/lyra/help/primitives.tsx` building blocks (`SectionHeader`, `Subsection`, `Steps`/`Step`, `Note`, `InfoBox`, `Strong`, `PlatformBadge`, `StatusBadge`/`StatusRow`, `MetricRow`, `Divider`), TypeScript (`tsc --noEmit`) as the only automated check (there's no app logic here to unit test — accuracy is verified by review against real code, not by an automated test suite).

---

## Phase 0 — Shared facts + Trends patch

### Why

The audit's own "Cross-file patterns" section (`docs/investigations/2026-08-24-help-docs-audit-findings.md:263-267`) already identifies 5 facts that are wrong identically across multiple files. If each of the 12 rewrite implementers re-derives these independently, the fix pass risks re-introducing a milder version of the original drift problem — 2-3 files ending up with subtly different (possibly still-wrong) wording for the same underlying reality. The audit's per-file investigations already did the real code verification; this task consolidates that already-verified material into one block rather than re-investigating from scratch.

### What

A single reference block (embedded directly in the implementation plan, not a separate file — it's short enough, and inlining avoids every implementer needing to read an extra file), stating each fact plainly enough to paste into any Subsection's prose:

1. **No workspace-editing screen exists anywhere.** There is no "Settings → General" tab. A workspace's name, website URL, and industry are set once at creation and are never editable afterward through any UI. (The only genuinely editable workspace-level setting anywhere in Settings is Timezone.) Claimed by section-02, section-04, section-10.
2. **No Guardrails configuration screen exists.** The guardrails API only exposes DELETE — no code path can create a `NEVER_DISCUSS`, `NEVER_USE_WORD`, or `APPROVED_ANSWERS` guardrail; the one path that writes a guardrail at all hardcodes `ALWAYS_ESCALATE`. The only real guardrail-adjacent UI in the product is the **Crisis Keywords panel on the Brand AI page**, which manages exactly that one guardrail type. Guardrails are not plan-gated in code — they're reachable on every tier, contrary to any "Agency plan only" claim. Claimed by section-07, section-10.
3. **The sidebar/nav label is "Brand AI", not "Brand Intelligence."** Every doc reference to "Brand Intelligence" as a UI label should read "Brand AI" (prose describing the *concept* of brand intelligence can stay, but UI navigation references must match the real label). The nav list is also missing Competitors, Repurpose, Dashboard, and Trends as shipped items in at least one file (section-01) — any file listing nav items should include the real full set. Claimed by section-01, section-04, and implicitly others.
4. **Disconnecting a social account does not revoke or delete its token.** The code only flips `isActive: false`; the encrypted access/refresh token, expiry, and webhook ID all persist indefinitely in the `SocialAccount` row. Only account/workspace deletion actually removes the row. Claimed by section-03, section-14.
5. **Plan/feature gating matrix** (the actual enforced boundaries, since section-07/10/11 each currently describe them differently):
   - **AI caption generation**: available on every plan including Starter — the generation endpoint has no plan gate, and Starter is explicitly listed as including it.
   - **Draft + Approve autonomy**: not gated to a specific plan in a way that prevents the broken combination — Starter workspaces can have it enabled (billed drafts generate), but the approval UI is hidden from Starter. Document this as the real (broken) behavior, not as a clean plan boundary — do not silently imply it's fixed.
   - **Full autonomy (AI auto-responds)**: gated to Pro and Agency plans — confirmed directly in `components/lyra/settings/autonomy-selector.tsx:103` (`disabled = option.mode === 'FULL' && !isPro`), not "Agency plan only" as any file currently claims. The same component also confirms the real UI labels any doc referencing this control should use: the settings section is titled **"AI Response Mode"** (not "AI Autonomy"), and the three modes are labelled **"No reply"**, **"Post with approval"**, and **"Full Automatic"** (not whatever autonomy-mode names any file currently invents).
   - **Guardrails**: not plan-gated at all (see fact 2 above) — available on every tier, not "Agency plan" or "Pro + Crisis Aware" as any file currently claims.

Apply this block verbatim (or lightly reworded per file's voice, without changing the facts) inside every Wave 1-4 implementer's prompt.

In this same task, apply Trends' one-line patch directly (no implementer dispatch needed — 0 Critical findings, the file is 22 lines): `components/lyra/help/section-13-trends.tsx`'s `<Note>` currently says "so no one is charged for it before it launches," which the audit found is not a safe blanket claim (a remediation script exists specifically because pre-disable subscribers could still exist, even though zero currently do). Reword to something like: "Checkout for the add-on is currently disabled to prevent new sign-ups before it launches." (drop the "so no one is charged" causal claim entirely, since it isn't one this doc can guarantee).

### Deliverable

The shared-facts block (as plan text, ready to paste into implementer prompts) plus the Trends file's one-line edit, committed directly by the plan's executor (me) as the first commit on the branch.

---

## Phase 1-4 — Twelve file rewrites, in 4 review-gated waves

### Why

All 12 files have real Critical findings (fictional UI, inverted behavior, undocumented shipped features) — per the approved design decision, each gets a full rewrite against real code rather than a surgical per-claim patch, since several files (section-05, section-07) have so much fictional content that patching around it would leave an incoherent mix of accurate-old and patched-new prose. This includes section-03, section-06, and section-09 (per the approved decision to fold the 3 "Phase 0" files' remaining findings into this same pass rather than leaving them for a separate future effort) — each gets the same full-regeneration treatment as the other 9, using its complete finding list (not just the narrow claim already fixed in PR #49).

### What

**Wave order (worst-first by total finding count across all 13 files):**
- Wave 1: `section-07-inbox.tsx` (20 findings), `section-05-content-calendar.tsx` (18), `section-04-brand-intelligence.tsx` (17)
- Wave 2: `section-02-workspaces.tsx` (16), `section-01-getting-started.tsx` (13), `section-08-seo.tsx` (13)
- Wave 3: `section-11-billing.tsx` (13), `section-10-settings.tsx` (12), `section-06-compose.tsx` (11)
- Wave 4: `section-09-analytics.tsx` (11), `section-03-social-connections.tsx` (11), `section-14-data-deletion.tsx` (10)

**Per-wave execution:** 3 implementer subagents dispatched together (matching how the original 10-file audit itself fanned out per-file investigators — these are fully independent files with no shared state, so parallel dispatch doesn't create the merge conflicts the usual "never parallelize implementers" guidance is meant to prevent). Each implementer gets, in full:
- The complete current text of its target file.
- The complete audit findings for that file, copied verbatim from `docs/investigations/2026-08-24-help-docs-audit-findings.md` (Critical + Important + Minor, not summarized).
- The Phase 0 shared-facts block.
- Pointers to the real feature code to verify against (the audit findings already name most of these; e.g. for section-07: `components/lyra/inbox/*`, the comment-sync route, `Comment.sentiment`/`AWAITING_APPROVAL` status, autonomy-mode logic, guardrail types in the Prisma schema).
- Instruction: rewrite the file's JSX fully using the existing `primitives.tsx` building blocks and this file's existing local-component patterns (e.g. section-11's `PlanCard`) where a local component already exists for the content shape; add new local components only if the file's existing shape doesn't fit newly-documented real content. Every Critical and Important finding must be resolved; Minor findings should be fixed where cheap, and explicitly noted (not silently dropped) if judged not worth the wording churn. Where the audit found a genuinely undocumented shipped feature (e.g. section-08's on-page scorer and AI content generator), add a new Subsection documenting it for the first time.

**Review per file (spec-compliance then quality, matching this session's established two-stage pattern):**
- **Spec-compliance reviewer**: checks every Critical/Important/Minor finding for that file against the rewritten text — confirmed fixed, or explicitly and reasonably deferred (not silently missed). Also checks the shared-facts block is applied consistently (no reintroduction of "Brand Intelligence," no re-claiming a workspace-editing screen, etc.).
- **Quality/accuracy reviewer**: this is documentation, so "quality" here means factual accuracy, not code style. The reviewer independently re-reads a sample of the real feature code the file now makes claims about (fresh grep/read, not trusting the implementer's citations) and confirms at least 3-4 non-trivial claims per file actually hold — the point of this whole pass is eliminating fabrication, so a review that only checks prose quality without touching the real code would defeat the purpose. Also checks the file still renders coherently as a whole (no orphaned references, consistent terminology, JSX still matches `primitives.tsx`'s actual exported signatures).
- Fix-and-re-review loops exactly as established elsewhere this session — don't move to the next wave until the current wave's 3 files are both spec-clean and accuracy-clean.

**Model selection:** standard model for implementers (mechanical-ish once given the real findings and code pointers); the quality/accuracy reviewer should use a strong model given the anti-fabrication purpose is the entire point of the exercise — cheaping out on that review defeats the pass.

### Deliverable

12 rewritten files, each on its own commit(s), each having passed both review stages, on the same branch as Phase 0's commit.

---

## Phase 5 — Wrap-up (done directly, not delegated)

### Why

Matches this session's established pattern: after all subagent-driven tasks complete, the controller does final verification and ships directly rather than delegating the wrap-up.

### What

1. Read all 13 changed files together (not per-file) to catch cross-file inconsistencies the per-wave reviews couldn't see — e.g. does section-07 and section-10 now describe Guardrails identically; does every "Brand AI" reference match; does the plan/feature matrix read the same in section-07/10/11.
2. Run `tsc --noEmit` (or the project's existing typecheck script) and a full `next build` to confirm nothing broke.
3. Push the branch, open one PR covering all 13 files (Phase 0's Trends patch, plus the 12 rewrites) with a description summarizing what changed per file at a high level. This is a normal "CI green, ready to merge" PR — none of this touches live legal text or financial logic, so it does not need the "NEEDS REVIEW, don't merge" framing the Privacy Policy PR required.

### Deliverable

One PR, CI green, ready for Richard to merge.

---

## What this design deliberately does not do

- Does not fix the 6 real product bugs the audit surfaced as a side effect (brand-guidelines-erasing cron, dead `languageLevel` field, unignested Google Business reviews, always-null `sentiment`, dead `AWAITING_APPROVAL` status, broken Starter+Draft-Approve combination) — those are separate, not-yet-requested work.
- Does not build any recurrence-prevention mechanism (tests tied to Help content, a review cadence) to keep these docs in sync with future shipped changes — explicitly parked as a future decision in the original Help-docs-audit design doc, not part of this fix pass.
- Does not restructure `primitives.tsx` or introduce new shared primitives beyond what each file's rewrite needs locally — no speculative design-system work.
- Does not re-run the audit or re-investigate findings already documented in `docs/investigations/2026-08-24-help-docs-audit-findings.md` — that document is treated as ground truth input, not re-derived.
