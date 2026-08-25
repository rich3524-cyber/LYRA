# Help-Docs Fix Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on task shape:** this is documentation/JSX content work, not application logic — there is no TDD red-green cycle and no pre-written "correct" code to paste in. Per `docs/superpowers/specs/2026-08-25-help-docs-fix-design.md`, each rewrite task's actual JSX is produced by the implementer through fresh verification against real shipped code (the same way the original audit was produced), constrained by the complete finding list and shared facts embedded in the task. Verification is `tsc`/build correctness plus the two-stage review process (spec-compliance, then an accuracy review that independently re-checks claims against the code) — not a failing-test-first workflow. Do not skip a task's finding list or shared-facts block thinking it's optional context; it is the actual spec the implementer must satisfy.

**Goal:** Fix every unfixed finding across all 13 files in `components/lyra/help/`, per `docs/investigations/2026-08-24-help-docs-audit-findings.md`, so every claim in the Help docs matches shipped code.

**Architecture:** Task 0 establishes the shared cross-file facts block and patches the one clean file (Trends). Tasks 1–12 rewrite the other 12 files in 4 waves of 3 (worst-first by finding count), each a full-regeneration rewrite against real code using the file's existing `primitives.tsx` building blocks. Task 13 does final cross-file consistency verification and ships one PR.

**Tech Stack:** Next.js JSX components (`components/lyra/help/section-*.tsx`), shared `components/lyra/help/primitives.tsx`, TypeScript (`tsc --noEmit`).

---

## Shared facts block (embed verbatim in every Task 1–12 implementer prompt)

1. **No workspace-editing screen exists anywhere.** There is no "Settings → General" tab. A workspace's name, website URL, and industry are set once at creation and are never editable afterward through any UI. The only genuinely editable workspace-level setting anywhere in Settings is Timezone. (Affects section-02, section-04, section-10.)
2. **No Guardrails configuration screen exists.** The guardrails API only exposes DELETE — no code path can create a `NEVER_DISCUSS`, `NEVER_USE_WORD`, or `APPROVED_ANSWERS` guardrail; the one path that writes a guardrail at all hardcodes `ALWAYS_ESCALATE`. The only real guardrail-adjacent UI in the product is the **Crisis Keywords panel on the Brand AI page**, which manages exactly that one guardrail type (this is a real, working, shipped feature — describe it accurately where relevant, don't just say "doesn't exist"). Guardrails are not plan-gated in code — reachable on every tier, contrary to any "Agency plan only" claim. (Affects section-07, section-10.)
3. **The sidebar/nav label is "Brand AI", not "Brand Intelligence."** Every doc reference to the UI label should read "Brand AI" (prose describing the *concept* of brand intelligence can stay as prose, but navigation/label references must match the real label). The real full nav item list is: Dashboard, Calendar, Compose, Inbox, Brand AI, Competitors, Repurpose, SEO, Analytics, Trends, Settings — any file listing nav items should include the real full set, not a partial one. (Affects section-01, section-04, and implicitly others.)
4. **Disconnecting a social account does not revoke or delete its token.** The code only flips `isActive: false`; the encrypted access/refresh token, expiry, and webhook ID all persist indefinitely in the `SocialAccount` row. Only account/workspace deletion actually removes the row. There is also no confirmation dialog for disconnect, and the "three-dot menu" some files describe doesn't exist — disconnect is a direct button/action next to the account. (Affects section-03, section-14, and section-10's Social Accounts list.)
5. **Plan/feature gating matrix** (the actual enforced boundaries — section-07/10/11 each currently describe them differently):
   - **AI caption generation**: available on every plan including Starter — the generation endpoint has no plan gate, and Starter's own feature list includes it.
   - **Draft + Approve autonomy**: not gated in a way that prevents a real broken combination — Starter workspaces can have it enabled (billed drafts generate), but the UI to approve those drafts is hidden from Starter. Document this as the real (broken) behavior, not as a clean plan boundary — do not silently imply it's fixed.
   - **Full autonomy (AI auto-responds)**: gated to Pro and Agency plans — confirmed in `components/lyra/settings/autonomy-selector.tsx:103` (`disabled = option.mode === 'FULL' && !isPro`), not "Agency plan only" as several files claim. The same component confirms the real UI labels: the settings section is titled **"AI Response Mode"** (not "AI Autonomy"), and the three modes are labelled **"No reply"**, **"Post with approval"**, and **"Full Automatic"** — not whatever mode names any file currently invents.
   - **Guardrails**: not plan-gated at all (see fact 2) — available on every tier, not "Agency plan" or "Pro + Crisis Aware" as any file currently claims.

---

## Task 0: Shared facts block + Trends one-line patch

**Files:**
- Modify: `components/lyra/help/section-13-trends.tsx`

This task has no implementer dispatch — it's small enough to do directly.

- [ ] **Step 1: Apply the Trends wording fix**

In `components/lyra/help/section-13-trends.tsx`, the current `<Note>` block (lines 14-19) reads:

```tsx
      <Note>
        LYRA Trend is not yet available. Checkout for the add-on is currently disabled so no
        one is charged for it before it launches. There is no Trend Hub, no trend discovery
        sync, and no composer integration today. This section will be filled in once the
        feature ships.
      </Note>
```

The audit (`docs/investigations/2026-08-24-help-docs-audit-findings.md:236`) found the "so no one is charged for it" causal claim isn't safe — a remediation script exists specifically because pre-disable subscribers could still exist (currently zero found, but the doc's blanket "no one is charged" claim doesn't hold as a general statement). Replace with:

```tsx
      <Note>
        LYRA Trend is not yet available. Checkout for the add-on is currently disabled to
        prevent new sign-ups before it launches. There is no Trend Hub, no trend discovery
        sync, and no composer integration today. This section will be filled in once the
        feature ships.
      </Note>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root (confirmed: `package.json` has no dedicated `typecheck` script, so use `tsc` directly — `tsconfig.json` is present at the project root).
Expected: no new errors introduced.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-13-trends.tsx
git commit -m "docs(help): fix stale billing claim in Trends section"
```

---

## Wave 1

### Task 1: Rewrite section-07-inbox.tsx

**Files:**
- Modify: `components/lyra/help/section-07-inbox.tsx`

**Current file text (for reference — the rewrite may restructure freely, it does not need to preserve this structure):**

```tsx
import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step, PlatformBadge, StatusBadge, StatusRow } from './primitives'

function AutonomyCard({ name, plan, children }: { name: string; plan: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 rounded-xl bg-background-secondary border border-background-border space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm font-medium text-text-primary">{name}</p>
        <span className="font-sans text-xs text-text-tertiary">{plan}</span>
      </div>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

function GuardrailRow({ type, children }: { type: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 rounded-xl bg-background-secondary border border-background-border space-y-2">
      <p className="font-sans text-sm font-medium text-text-primary">{type}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

export function InboxSection() {
  return (
    <section id="inbox" className="space-y-8 scroll-mt-28">
      <SectionHeader n="07" title="Inbox" />
      {/* ... full current content: intro paragraph on 5-minute polling of all 6 platforms;
          "How comments are collected" listing Facebook/Instagram/LinkedIn/Google Business/X/TikTok;
          "Comment statuses explained" (Pending, AI Drafted, Awaiting Approval, Responded, Escalated, Ignored);
          "AI autonomy settings" (Off/all plans, Draft+Approve/Pro+Agency, Full Autonomy/Agency only) via AutonomyCard;
          "Reviewing and approving a response" 6-step flow with "Approve & Post" button, amber border, comment-left/draft-right panel;
          "Writing a manual response" via "Write manually" control;
          "Filtering the inbox" (Status/Platform/Date range/Sentiment, last-30-days default, escalated pinned to top);
          "Guardrails (Agency plan)" via GuardrailRow x4 (Never discuss, Never use word, Always escalate, Approved answers),
          "checked before any response is generated" claim. See the audit findings below for exactly what's wrong with each part. */}
    </section>
  )
}
```

(The implementer should read the actual current file at `components/lyra/help/section-07-inbox.tsx` before starting — the excerpt above is abbreviated for this plan; the real file is ~215 lines and every claim in it is covered by the findings below.)

**Complete audit findings for this file** (`docs/investigations/2026-08-24-help-docs-audit-findings.md`, section-07-inbox.tsx — 5 Critical, 10 Important, 5 Minor, the most of any file):

> **Critical:**
> 1. "Settings → Guardrails" doesn't exist, and 3 of the 4 documented guardrail types cannot be created by any code path. The guardrails API only exposes DELETE; the sole write path anywhere in the codebase hardcodes `ALWAYS_ESCALATE` only.
> 2. Platform list is wrong — 3 of 6 listed platforms aren't ingested. Comment sync is hard-filtered to Facebook/Instagram/LinkedIn only. TikTok comments are explicitly unsupported via Zernio (code comment confirms it). Google Business reviews are never ingested at all — no `Review` model exists in the schema, and the fetch function is never called anywhere (this is a real, still-unfixed product bug — describe the current broken state accurately, do not describe it as working). X/Twitter has no polling branch.
> 3. "Awaiting Approval" status is dead code — no path ever assigns it; drafts are written with a different status entirely (real, unfixed bug — describe current behavior accurately).
> 4. Approved answers are not used verbatim and have no trigger-matching — they're a soft prompt hint the model may or may not follow; the doc's "factual accuracy guarantee" doesn't exist.
> 5. Full Autonomy is not Agency-only — Pro workspaces can access it too (see shared fact 5).
>
> **Important:** Draft + Approve has no real server-side plan gate — Starter workspaces can have it enabled and drafts generated (and billed), but the UI to approve those drafts is hidden from Starter, a broken combination (real, unfixed bug — describe accurately, don't imply it's fine); only 1 of 4 documented inbox filters exists (platform only — no date range or sentiment filter, and status is fixed tabs, not a filter); sentiment is never classified — the field is always null (real, unfixed bug); inbox is not scoped to "last 30 days" — it's the most recent 100 rows of all time, unbounded by date; escalated comments are not pinned to the top — they're in a completely separate tab, excluded from the main list; guardrails are not all checked pre-generation — only `ALWAYS_ESCALATE` is; the others are checked against the model's *output* after the (billed) call already happened; "Never discuss" is a literal substring scan of the generated response, not a topic classifier of the incoming comment; the described review panel (comment left, draft right, amber border) doesn't exist — cards are always fully expanded inline, single column, no conditional border; "Write manually" control doesn't exist — the same textarea is just editable; the approve button is labelled "Approve & send", not "Approve & Post" as stated three separate times in the doc.
>
> **Minor:** all 3 autonomy mode names differ from the actual UI labels (see shared fact 5); the settings section is named "AI Response Mode", not "AI Autonomy"; "Pending" status is not reliably brief — with autonomy Off it sits indefinitely; escalation *does* have a Slack/Teams notification path, contrary to the doc's "no notification yet" caveat; "Guardrails (Agency plan)" over-restricts — Pro-with-Crisis-Aware-add-on also has access.

**Real code to verify claims against:** `components/lyra/inbox/*` (the actual inbox UI components — card layout, review flow, filters), the comment-sync/polling worker (platform list, 5-minute cadence — confirm this is still accurate), the Prisma schema for `Comment` (status enum values — confirm `AWAITING_APPROVAL` really is unused, confirm `sentiment` field), the guardrails API route (confirm DELETE-only), `components/lyra/settings/autonomy-selector.tsx` (mode labels, plan gate — already given in shared fact 5), the Crisis Keywords panel on the Brand AI page (shared fact 2).

**Shared facts block:** apply the full block above (all 5 facts are relevant to this file — 1, 2, and 5 especially).

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-07-inbox.tsx` fully, using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `PlatformBadge`, `StatusBadge`, `StatusRow`, and this file's own local `AutonomyCard`/`GuardrailRow` components (or new local components if the real content doesn't fit them). Resolve every Critical and Important finding above; fix Minor findings where cheap. Where a finding describes a real unfixed product bug (dead `AWAITING_APPROVAL`, null `sentiment`, unignested Google Business reviews, broken Starter+Draft-Approve combo), describe the *actual current behavior* accurately — do not describe the intended/fixed behavior, and do not silently omit the limitation.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-07-inbox.tsx
git commit -m "docs(help): rewrite Inbox section against real shipped behavior"
```

---

### Task 2: Rewrite section-05-content-calendar.tsx

**Files:**
- Modify: `components/lyra/help/section-05-content-calendar.tsx`

**Current file text (for reference):**

```tsx
import { SectionHeader, Subsection, Strong, Note, StatusRow } from './primitives'

export function ContentCalendarSection() {
  return (
    <section id="content-calendar" className="space-y-8 scroll-mt-28">
      <SectionHeader n="05" title="Content Calendar" />
      {/* Full current content: intro on visual overview/drag-reschedule/preview/composer;
          "Reading the calendar" (platform icon, 30-40 char caption, coloured left border, scheduled time,
            "+N more" overflow expander claim); "Post status indicators" via StatusRow x7
            (Draft, Pending Approval, Approved, Scheduled, Published, Failed, Cancelled);
          "Navigating between months"; "Rescheduling posts by dragging" (Draft/Pending/Approved/Scheduled
            draggable, Published/Failed NOT draggable per the doc's Note); "Previewing a post" (Edit/
            Duplicate/Cancel post/View on platform buttons); "Creating a post from the calendar"
            (+ New post button on empty day cells); "Filtering the calendar" (platform filter buttons,
            multi-select); "AI Schedule Generator" (3/6 week batch, per-platform-sequential generation,
            CSV export, Add all to calendar creates drafts). See findings below for what's wrong. */}
    </section>
  )
}
```

(Implementer reads the real file at `components/lyra/help/section-05-content-calendar.tsx`, ~155 lines, before starting.)

**Complete audit findings** (section-05-content-calendar.tsx — 6 Critical, 7 Important, 5 Minor, the worst of the newly-audited files):

> **Critical:**
> 1. The entire "Filtering the calendar" subsection is fiction — the real filter is single-select by status (All/Scheduled/Drafts/Pending/Published/Failed); there is no platform filter anywhere.
> 2. The drag restriction is inverted — the doc says Published and Failed posts cannot be dragged; the actual drag handler has no status guard at all, so they can be.
> 3. The `+N more` day-overflow expander doesn't exist — every post/campaign renders unconditionally in a growing cell.
> 4. Clicking an empty day cell does nothing — no "+ New post" button; the only entry point is a header-level link with no date pre-fill.
> 5. Published posts show neither a publish timestamp nor a link to the live post — the detail panel's only date field is `scheduledAt`; `publishedAt` is fetched but never rendered, and there's no outbound platform link anywhere.
> 6. Drafts with no scheduled date never appear on the calendar at all — contrary to the doc's claim they show up on their creation date; the query filters them out entirely.
>
> **Important:** no Retry option and no "Edit & Reschedule" flow for failed posts (the only real action is "Move back to draft"); Approved does not move to Scheduled "automatically" on media attach — it requires a manual click, which is itself hidden while media is missing; posts are never auto-cancelled when a social account disconnects; no Duplicate button exists, and media is shown as a text count, not previews; 3 of 4 "reading the calendar" chip claims are wrong (dot not icon, full text not truncated, badge not border, desktop chip shows no time at all); clicking a chip opens the detail panel, not the composer, directly contradicting another line in the same doc; CSV export silently drops posts that have media attached, or hard-errors if none qualify.
>
> **Minor:** "Add all to calendar" creates drafts, not scheduled posts; generation is per-week/concurrent, not "one platform at a time"; Today button and chevrons aren't positioned as described; the Approved legend color doesn't match what actually renders; bulk import, the mobile agenda view, and email-campaign display on the calendar are all undocumented (add Subsections for these if confirmed real and shipped).

**Real code to verify against:** the calendar grid component and its drag handler (`components/lyra/calendar/*` or equivalent — locate via the actual directory listing), the post detail panel component, the CSV export route/function, the AI Schedule Generator flow.

**Shared facts block:** apply the full block (fact 3 "Brand AI" labeling is not directly relevant here, but check for any stray "Brand Intelligence" reference; facts 1/2/4/5 are not centrally relevant to this file but check for accidental overlap).

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-05-content-calendar.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Note`, `StatusRow`. Resolve every Critical and Important finding; fix Minor findings where cheap, and add new Subsections for the confirmed-real undocumented features (bulk import, mobile agenda view, email-campaign display) if they're genuinely shipped — verify each against real code before documenting it, don't take the audit's mention as proof alone.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-05-content-calendar.tsx
git commit -m "docs(help): rewrite Content Calendar section against real shipped behavior"
```

---

### Task 3: Rewrite section-04-brand-intelligence.tsx

**Files:**
- Modify: `components/lyra/help/section-04-brand-intelligence.tsx`

**Current file text (for reference):**

```tsx
import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

function VoiceField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <p className="font-sans text-sm font-medium text-text-primary shrink-0 w-44">{label}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

export function BrandIntelligenceSection() {
  return (
    <section id="brand-intelligence" className="space-y-8 scroll-mt-28">
      <SectionHeader n="04" title="Brand Intelligence" />
      {/* Full current content: intro; "How it works" 4-step pipeline (website crawl of homepage/about/
          services/blog/linked pages, social feed analysis, document parsing, profile synthesis, 30-90s);
          "Building the brand profile" 5-step flow incl. "Upload guidelines" button, PDF/DOCX/DOC up to 20MB,
          progress bar with 4 stages; "Understanding the voice summary" via VoiceField x5 (Brand personality,
          Writing style, Core themes & key messages, What to avoid, Audience); "Tips for the best results";
          "Refreshing the profile" incl. automatic weekly refresh claim "uses the same inputs as a manual
          rebuild"; "Crisis Aware keyword suggestions"; "What happens without a brand profile" (AI features
          disabled, "all other features work regardless"). See findings below. */}
    </section>
  )
}
```

(Implementer reads the real file at `components/lyra/help/section-04-brand-intelligence.tsx`, ~210 lines, before starting.)

**Complete audit findings** (section-04-brand-intelligence.tsx — 4 Critical, 8 Important, 5 Minor; includes 2 real unfixed product bugs):

> **Critical:**
> 1. The "Upload guidelines" flow does not exist in the UI — only a paste-in textarea is shipped. The upload API exists but nothing calls it.
> 2. The weekly automated refresh doesn't do what the manual rebuild does, and silently erases pasted guidelines (real, unfixed bug). The cron only picks up workspaces with a website URL, scrapes the homepage only (not multiple pages), uses zero social signal (hardcoded empty array), and its upsert overwrites `userGuidelines` with nothing. Describe this accurately as a real risk/limitation, not as working correctly.
> 3. "Social feed analysis" doesn't read any social feed — it reads LYRA's own `Post` table (posts authored *in* LYRA), never calls a platform API. A workspace with Facebook/Instagram connected but no LYRA-authored posts contributes zero social signal, the opposite of the doc's advice.
> 4. The 5-area Voice Summary structure doesn't match what's actually built — "Writing style" and "What to avoid" fields don't exist in the schema or the Claude prompt; the AI has no backing data for "actively avoids these topics."
>
> **Important:** website crawl scope is 3 hardcoded URLs, not "blog posts and any linked pages"; no progress bar exists (a single spinner); the website-URL "Edit" verification step doesn't exist (see shared fact 1 — there's no way to edit it at all, from this page or Settings); the social-account prerequisite is a hard blocking gate, not an optional tip as documented; "what happens without a profile" is wrong on 3 counts (comments auto-escalate rather than "disabled"; no inline prompt links to the Brand page; AI schedule generation is blocked, contrary to "scheduling works regardless"); document parsing only works for plain text/markdown — PDF/DOCX fall through to raw-byte extraction, effectively non-functional; sidebar label mismatch (see shared fact 3 — "Brand AI" not "Brand Intelligence"); the Audience "language level" field is dead code (real, unfixed bug — `audience.languageLevel` is read by the UI but the build pipeline writes `audienceProfile.language` instead; describe only the fields that are actually populated, or note this one is currently non-functional if it must be mentioned).
>
> **Minor:** theme-count mismatch (3-7 documented vs. 5-8 actually prompted); undocumented rebuild rate limit (5 per 5 minutes); crisis-keywords panel visibility description is slightly off; wrong settings path named for the Crisis Aware toggle; profile injection reach is overstated (not read by content-scorer, repurposer, or crisis-detector).

**Real code to verify against:** the brand-profile build pipeline (website crawl scope, social-feed-analysis data source, document parser), `workers/brand-sync.worker.ts` (the weekly refresh cron), the Claude prompt/schema for the Voice Summary (which fields actually exist), the Crisis Keywords panel (shared fact 2), the Brand page's audience fields (`audienceProfile.language` vs. `languageLevel`).

**Shared facts block:** apply the full block — facts 1 and 3 are directly relevant (no Settings→General editor exists for the website URL; "Brand AI" not "Brand Intelligence" as the nav label, though the section title itself can stay "Brand Intelligence" as page content, only nav/UI-label references need correcting).

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-04-brand-intelligence.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`, and the file's own `VoiceField` local component (adjust its use to only the fields that really exist in the schema/prompt). Resolve every Critical and Important finding; fix Minor findings where cheap. For the 2 real product bugs (guidelines-erasing cron, dead `languageLevel` field), describe actual current behavior, not intended behavior.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-04-brand-intelligence.tsx
git commit -m "docs(help): rewrite Brand Intelligence section against real shipped behavior"
```

---

## Wave 2

### Task 4: Rewrite section-02-workspaces.tsx

**Files:**
- Modify: `components/lyra/help/section-02-workspaces.tsx`

**Current file text (for reference — implementer reads the real ~120-line file at `components/lyra/help/section-02-workspaces.tsx` before starting):** covers: intro on workspaces as self-contained per-client environments; plan-limit InfoBox (Starter 1 / Pro 5 / Agency unlimited); "Creating a workspace" 6-step flow (Workspace name, Website URL, Industry fields; no mention of Client Access); "Switching between workspaces" incl. a `ws_abc123`-style deep-link example; "Editing workspace details" claiming a "Settings → General" screen with 4 editable fields; "Workspace overview page" description; "Deleting a workspace" claiming a type-to-confirm dialog in "Settings → General → Danger Zone".

**Complete audit findings** (section-02-workspaces.tsx — 7 Critical, 5 Important, 4 Minor):

> **Critical:**
> 1. "Settings → General" does not exist — the settings page has no General tab/section at all.
> 2. Workspace name is not editable anywhere in the UI (API supports it, nothing calls it).
> 3. Website URL is not editable anywhere in the UI.
> 4. Industry is not editable anywhere in the UI. (Only Client timezone, of the doc's 4-item list, is real.) Aggravating: the Brand page's setup checklist has a "Go to Settings" button for the website URL that lands on a page with no such field.
> 5. No brand-profile rebuild prompt fires on website URL change — no such prompt exists, and there's no UI to change the URL in the first place.
> 6. Deleting a workspace does not ask you to type the workspace name to confirm — the dialog has no text input, Delete fires immediately on click.
> 7. "New workspace" is never disabled when at the plan limit, and there's no upgrade prompt at the point of creation — the limit only surfaces as an error message *after* filling in the entire creation form.
>
> **Important:** the creation field is labelled "Client name", not "Workspace name"; Industry is display-only and never reaches any AI prompt; the workspace name IS shown to the client (doc claims it's agency-only); the overview page's description (connection status, brand-build status, action items) is largely wrong — it shows 3 stat cards and a recent-posts list, nothing else; the creation form's fields are in a different order than documented and a whole 4th field (Client access — a materially more consequential choice than industry) is undocumented.
>
> **Minor:** fictional workspace-ID example format (`ws_abc123` vs. real cuids — use the real ID format); switcher not available "at any time" (hidden when sidebar collapsed); plan limit is bypassed entirely for users with no agency.

**Real code to verify against:** the workspace creation form/route (field list, field order, real Client Access field), the workspace settings page (confirm no General tab exists — only Timezone), the workspace deletion dialog/route, the workspace switcher component (real cuid ID format).

**Shared facts block:** apply the full block — fact 1 (no workspace-editing screen) is the central fact for this file; findings 1-5 above are all instances of fact 1.

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-02-workspaces.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`, `InfoBox`. Remove the fictional "Editing workspace details" subsection entirely (per shared fact 1, replace with an accurate statement that workspace name/URL/industry are set at creation and not editable afterward — only Timezone is). Resolve every Critical and Important finding; fix Minor findings where cheap.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-02-workspaces.tsx
git commit -m "docs(help): rewrite Workspaces section against real shipped behavior"
```

---

### Task 5: Rewrite section-01-getting-started.tsx

**Files:**
- Modify: `components/lyra/help/section-01-getting-started.tsx`

**Current file text (for reference — implementer reads the real ~130-line file before starting):** intro; "Creating your account" 5-step flow claiming a "Get started free" button on the live marketing site, 14-day trial on Pro/Agency only, "no credit card required"; "The dashboard" bullet list (7-day posts, unread comments, brand-status, quick-link, billing notices); "Navigating the app" nav list (missing Competitors/Repurpose/Dashboard/Trends, labels Brand Intelligence not Brand AI, claims a search icon and command palette); "Recommended setup order" 6-step flow.

**Complete audit findings** (section-01-getting-started.tsx — 3 Critical, 6 Important, 4 Minor):

> **Critical:**
> 1. Free trial length is wrong — doc says 14 days on Pro/Agency only; code (`app/onboard/page.tsx:57-58`) sets `trial_period_days: 30` for every plan. Contradicts both the marketing page (`app/page.tsx:130`, "30-day") and section-11-billing.tsx (":185", "30-day"). The stale `app/onboard/success/page.tsx` still says 14 days — don't be misled by it; the actual checkout config (30 days, all plans) is what's real.
> 2. "No credit card required to start" is false — Stripe Checkout in `mode: 'subscription'` with no `payment_method_collection: 'if_required'` requires a card up front; confirmed by the app's own post-checkout copy ("Card will be charged after your trial").
> 3. The entire "Creating your account" flow (Steps 1-5) describes an unshipped product. `lyraonline.ai` has no "Get started free" button — the live root page is a waitlist/coming-soon page. No plan-selection UI exists (`/onboard` reads plan from a `?plan=` query param, defaulting to PRO if absent). No step asks for an agency/business name — it's auto-generated (`${user.name}'s Agency`). "You are taken to the dashboard" is wrong — Stripe redirects to an interstitial requiring a manual "Enter LYRA" click.
>
> **Important:** "Account → Profile" cannot be edited — it's read-only display, and the page itself says "Profile details are managed through your login provider"; dashboard bullet list — 4 of 5 bullets wrong: actual KPIs are Pending comments/Scheduled today/Posts this week (not a rolling 7-day window); no per-workspace brand-status; no billing/account notice banner exists anywhere; sidebar nav list — "Brand Intelligence" is actually labelled "Brand AI" (see shared fact 3); four shipped items (Dashboard, Competitors, Repurpose, Trends) are missing from the doc's list; no search icon in the header — only an Upgrade button and avatar exist; no command palette either; Settings does not contain guardrails or client access — guardrails live on the Brand AI page (see shared fact 2); client access is set once at creation with no editor in Settings; sidebar does not collapse to icon-only on smaller screens — below the `lg` breakpoint it's removed entirely, replaced by a hamburger drawer; icon-only is a manual toggle available at any width.
>
> **Minor:** avatar dropdown has no billing item (billing is one level deeper, inside Account); workspace switcher invisible when sidebar collapsed; "guided setup prompt" for first workspace is just a static empty-state card, not a wizard; "most recently active workspace" quick-link has no recency logic (hardcodes `workspaces[0]`).

**Real code to verify against:** `app/onboard/page.tsx` (trial length, plan-selection, agency-name auto-generation), the live marketing root page (`app/page.tsx` or the actual waitlist page component — confirm current state), `app/(dashboard)/account/profile` or equivalent (read-only confirmation), the dashboard page component (real KPI list), the sidebar nav component (real nav item list and responsive-collapse behavior).

**Shared facts block:** apply the full block — fact 3 (Brand AI nav label, full nav item list) and fact 2 (no Guardrails screen) are directly relevant.

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-01-getting-started.tsx` fully using `primitives.tsx`'s `Divider`, `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`. The "Creating your account" flow needs the most substantial rework — describe the real waitlist/coming-soon state and the real `?plan=`-param-driven onboarding, not a fictional signup wizard. Resolve every Critical and Important finding; fix Minor findings where cheap.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-01-getting-started.tsx
git commit -m "docs(help): rewrite Getting Started section against real shipped behavior"
```

---

### Task 6: Rewrite section-08-seo.tsx

**Files:**
- Modify: `components/lyra/help/section-08-seo.tsx`

**Current file text (for reference — implementer reads the real ~150-line file before starting):** intro on GSC integration, read-only access; "Prerequisites" (verified property, Full/Owner access not Restricted, 28 days of data); "Connecting Google Search Console" 6-step flow incl. a property picker and "Connect this property" button; "Reading the SEO dashboard" — 4 metric cards (Clicks/Impressions/Avg CTR/Avg Position) + Top Queries (sortable) + Top Pages tables; "Changing the date range" — 6 preset options incl. 28-day default; "Disconnecting Search Console" via "Settings → Integrations → Disconnect", "no historical data stored, nothing to delete" claim.

**Complete audit findings** (section-08-seo.tsx — 5 Critical, 5 Important, 3 Minor):

> **Critical:**
> 1. "Settings → Integrations → Disconnect" doesn't exist — no Integrations section anywhere, no disconnect route for GSC; a user cannot disconnect GSC short of destroying the whole workspace.
> 2. No property picker and no "Connect this property" button — the property is chosen entirely server-side via fuzzy URL match, with a silent fallback to the first available site.
> 3. The dashboard has no metric cards — all 4 documented (Clicks/Impressions/Avg CTR/Avg Position) don't exist; only a chart and one query table are rendered.
> 4. The "Top Pages" table doesn't exist — the GSC client only ever requests `query` and `date` dimensions, never `page`.
> 5. There is no date-range picker — the windows are hardcoded (30 days for trend, 90 days for queries) and not user-adjustable.
>
> **Important:** "last 28 days" is wrong in both directions (actual: 30-day trend, 90-day queries, both explicitly labelled in the UI); column headers aren't sortable and the table caps at 25 rows, contrary to a documented sort-by-impressions workflow; "no historical data stored, nothing to delete" is misleading — tracked pages, AI-generated content, scores, and encrypted OAuth tokens all persist; the doc omits the module's two headline shipped features entirely (the on-page analyzer/scorer and the AI content generator, which is the *primary* section on the actual dashboard — these need new Subsections); the recommended client-onboarding workaround for connecting GSC doesn't work — the onboarding wizard has no account-connection step at all.
>
> **Minor:** access-level prerequisite is overstated (Restricted GSC access actually works, contrary to the doc); the "28 days of data" prerequisite has no basis in code; a lag-time figure disagreement (doc says 2-3 days, product says 3 days everywhere else).

**Real code to verify against:** the GSC connect flow (property-selection logic — fuzzy URL match), the SEO dashboard component (what's actually rendered: chart, query table, on-page scorer, AI content generator), the GSC client's API request dimensions (`query`/`date` only, confirm no `page`), what persists after "disconnect" isn't possible — confirm there really is no disconnect route.

**Shared facts block:** apply the full block; no single fact is central here, but check for any stray Settings→General or Guardrails references.

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-08-seo.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`, `MetricRow`. Remove the fictional metric cards, property picker, Top Pages table, and date-range picker. Add new Subsections documenting the on-page scorer and AI content generator (verify their real behavior against the actual components before writing). Resolve every Critical and Important finding; fix Minor findings where cheap.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-08-seo.tsx
git commit -m "docs(help): rewrite SEO section against real shipped behavior"
```

---

## Wave 3

### Task 7: Rewrite section-11-billing.tsx

**Files:**
- Modify: `components/lyra/help/section-11-billing.tsx`

**Current file text (for reference — implementer reads the real ~235-line file before starting):** intro on Stripe billing; "Plans" via `PlanCard` x3 (Starter $49, Pro $149, Agency $399) with feature lists; "Crisis Aware add-on (Pro plan)"; "Upgrading your plan" 5-step flow claiming a Stripe-hosted checkout redirect (this is now stale — the in-place-update fix from PR #56 means upgrades no longer redirect); "Managing your subscription" via Stripe Billing Portal; "Cancelling your subscription" claiming a "free read-only state" after cancellation; "Refund policy"; "Free trial" (claims 30-day, all plans — already correct per section-01's fix); "Invoices"; "Need help?".

**Complete audit findings** (section-11-billing.tsx — 3 Critical, 5 Important, 5 Minor; note: the underlying duplicate-subscription bug this file originally described was separately fixed in PR #56 — this task fixes the *documentation*, which must now describe the current, fixed, in-place-update behavior, not the old broken behavior the audit found):

> **Critical:**
> 1. Cancellation does not produce a "free read-only state" — the account silently downgrades to paid Starter (still $49/mo), which retains nearly full write access, not a read-only mode that doesn't exist anywhere in the codebase.
> 2. Upgrades are not pro-rated — a second concurrent subscription is created instead of modifying the existing one *(this was the pre-PR#56 behavior; confirm PR #56's in-place-update fix — `stripe.subscriptions.update` with `proration_behavior: 'create_prorations'`, no Checkout redirect — is what's live now, and document that instead)*.
> 3. "Full AI autonomy" is documented as Agency-exclusive, but Pro workspaces can enable it (see shared fact 5) — the plan constant declaring Pro's ceiling is defined but never actually read by any gate.
>
> **Important:** currency is asserted as USD but nothing in the code sets a currency — it lives entirely in the Stripe dashboard, unverifiable from the repo (soften or remove the currency claim); guardrail controls are documented as Agency-exclusive but aren't plan-gated anywhere, available on every tier (see shared fact 5); AI caption generation is documented as Pro-exclusive, but the plan-features list itself includes it under Starter, and the generation endpoint has no gate at all (see shared fact 5 — fix both the PlanCard feature lists and this prose); trial length contradicts the app's own post-checkout screen (30 vs. 14 days — 30 is correct, per section-01's Task 5 fix); the documented "Change plan" button doesn't exist (the real controls are "Manage billing", "Upgrade to X", and "Downgrade", none matching the doc).
>
> **Minor:** "Manage subscription" button is actually labelled "Manage billing" and is conditionally hidden; "6 social platforms" undercounts — the composer actually offers 7; the annual Crisis Aware add-on option is unreachable from any UI even though the backend supports it; the Starter Crisis Aware card has no upgrade CTA despite the doc's claim; "bank account" as a payment method isn't supported by the checkout flow's `payment_method_types`.

**Real code to verify against:** `app/api/stripe/create-checkout/route.ts` (the current, PR-#56-fixed in-place-update behavior for upgrades — confirm no Checkout redirect happens for an existing subscriber), `app/api/account/route.ts` (cancellation behavior — confirm it's a downgrade to Starter, not a read-only mode), `components/lyra/settings/autonomy-selector.tsx` (Full Autonomy's real Pro+Agency gate, shared fact 5), the guardrails API (no plan gate, shared fact 2/5), the AI caption generation endpoint (no plan gate), the composer's platform selector (confirm 7 platforms, not 6), the checkout flow's `payment_method_types` config.

**Shared facts block:** apply the full block — fact 5 (plan/feature gating matrix) is central to this file; verify every plan-gate claim in the `PlanCard` feature lists against it, not just the prose.

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-11-billing.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`, and the file's own local `PlanCard` component. Update "Upgrading your plan" to describe the real in-place-update flow (no Stripe redirect, prorated immediately) rather than the old Checkout-redirect flow. Fix every `PlanCard` feature-list line against shared fact 5. Resolve every Critical and Important finding; fix Minor findings where cheap.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-11-billing.tsx
git commit -m "docs(help): rewrite Billing section against real shipped behavior"
```

---

### Task 8: Rewrite section-10-settings.tsx

**Files:**
- Modify: `components/lyra/help/section-10-settings.tsx`

**Current file text (for reference — implementer reads the real ~260-line file before starting):** intro on workspace vs. account settings split; "Workspace settings — General" claiming 4 editable fields; "Workspace settings — Social Accounts" claiming 4 data points shown per account; "Workspace settings — AI Autonomy"; "Workspace settings — Crisis Aware"; "Workspace settings — Guardrails" claiming a full config screen, "Agency plan"; "Workspace settings — Client Access"; "Workspace settings — Approvals (deadlines)"; "Workspace settings — Team Notifications" (Slack integration); "Workspace settings — Integrations" naming only GSC; "Workspace settings — Danger Zone" claiming a type-to-confirm, 30-second deletion window; "Account settings — Profile" claiming editable display name/photo/email; "Account settings — Notifications".

**Complete audit findings** (section-10-settings.tsx — 5 Critical, 4 Important, 3 Minor):

> **Critical:**
> 1. "Workspace settings — General" (name/website/industry/timezone fields) doesn't exist — only the Timezone control is real (see shared fact 1).
> 2. "Client Access" isn't a settings-page control at all — it's set once at workspace creation with no post-creation editor.
> 3. "Guardrails" describes a full configuration screen that doesn't exist — no guardrail UI anywhere, and the API only supports delete (see shared fact 2).
> 4. "Account settings — Profile" editing (display name, photo, email, verification step) is entirely fictional — the account page is explicitly read-only, stating profile is managed through the login provider.
> 5. The Social Accounts list claims 4 data points (status variants, token expiry date, connection date); only platform and name are actually shown, and disconnected accounts are filtered out of the list entirely rather than shown with a "Disconnected" status.
>
> **Important:** the workspace timezone is not used by the composer or calendar at all, and Analytics uses the *viewer's browser* timezone instead, meaning two people in different countries see different daily buckets for the same workspace; the "Integrations" subsection names the wrong integration (documents GSC, which isn't there) and omits the real one (Email Marketing: Klaviyo/Mailchimp/Customer.io, which is — add a new Subsection for this, verified against real code); Danger Zone has no type-to-confirm and no "30 seconds" deletion window — it's a single click, synchronous; the Crisis Aware plan gate is internally inconsistent within the same file (one line says "Pro and Agency", another correctly says "Agency, or Pro with the add-on" — fix to the consistent, correct version everywhere).
>
> **Minor:** autonomy option labels don't match the shipped UI (see shared fact 5); the Trend add-on card is undocumented; "no self-service client onboarding link" is contradicted by a real, shipped token-based flow (though it serves a narrower purpose than full dashboard access — describe accurately, not as full parity).

**Real code to verify against:** the workspace settings page (confirm only Timezone is editable, per shared fact 1), the Social Accounts list component (confirm only platform+name shown, disconnected accounts filtered out), the account settings/profile page (read-only confirmation), the Integrations section (real Email Marketing integration — Klaviyo/Mailchimp/Customer.io), the workspace-deletion Danger Zone flow, the Crisis Aware plan-gate logic (resolve the internal inconsistency using the actual code, not by picking one of the doc's two contradictory lines).

**Shared facts block:** apply the full block — facts 1, 2, and 5 are all directly relevant (this file has the densest concentration of shared-fact violations of any file: "General" tab, Guardrails screen, and plan-gate claims all appear here).

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-10-settings.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Note`. Remove the fictional "Workspace settings — General" and "Guardrails" subsections' false claims per shared facts 1 and 2 (describe what's real instead: only Timezone is editable; the one real guardrail-adjacent UI is Crisis Keywords on the Brand AI page). Replace "Account settings — Profile" with an accurate read-only description. Add a new Subsection for the real Email Marketing integration. Resolve every Critical and Important finding; fix Minor findings where cheap.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-10-settings.tsx
git commit -m "docs(help): rewrite Settings section against real shipped behavior"
```

---

### Task 9: Rewrite section-06-compose.tsx

**Files:**
- Modify: `components/lyra/help/section-06-compose.tsx`

**Current file text (for reference — implementer reads the real ~220-line file before starting; this is a "Phase 0" file, PR #49 already fixed the single narrow claim about carousel drag-reorder that originally triggered the audit — the rest of the file, including several findings worse than that original claim, is unfixed):** intro on per-platform caption customization; "Selecting platforms"; "Writing your caption" (rich text incl. emoji/mention/link-preview); "Platform character limits" table; "Adding media" (20MB/image, 512MB/video, 10-image cap, per-platform customization tabs); "AI caption generation" 5-step flow claiming 3 variations, Regenerate/Refine; "Hashtag suggestions" (entirely fictional feature); "Scheduling a post" (6-month horizon, 5-min lead time, no backdating); "Saving as draft" claiming 30-second auto-save with browser confirmation prompt; "Sending for client approval" claiming an explicit "Send for approval" button.

**Complete audit findings** (section-06-compose.tsx — 5 Critical, 3 Important, 3 Minor; includes the single highest data-loss-risk finding across all 13 files):

> **Critical:**
> 1. False auto-save claim — the doc promises unsaved changes are auto-saved every 30 seconds with a browser confirmation prompt on close; no such timer or handler exists anywhere. A user trusting this can lose real work. **This is the highest-priority fix in this file — remove the false promise entirely, do not soften it.**
> 2. Per-platform caption customization is fictional — one shared editor exists; `handleSubmit` sends one `content` string to all selected platforms.
> 3. The documented 4-step AI workflow (brief prompt → 3 variations → Regenerate/Refine) is fictional — reality is one button, one generated caption, no variations, and the prompt explicitly instructs the model to return no alternatives.
> 4. Hashtag-suggestion feature is entirely fictional — no such button, endpoint, or logic exists anywhere.
> 5. "Send for approval" button doesn't exist — approval routing happens server-side after clicking the ordinary Schedule button; the user never makes an explicit choice.
>
> **Important:** media limits are wrong in 4 ways (documented 20MB/image and 512MB/video vs. actual flat 50MB cap for all media; no image-count cap exists at all despite a documented "10 images" limit; AVI is rejected, not accepted, while undocumented webm is accepted); character counter is in the wrong location with hardcoded limits for only 2 of 6 platforms; scheduling constraints (6-month horizon, 5-minute lead time, no backdating) are entirely unenforced in code (soften to "not currently enforced" or remove the specific numbers if they aren't real UI copy either — verify against the actual composer, don't just delete without checking).
>
> **Minor:** editor lacks emoji/mention/link-preview features the doc claims; "Add media" button is actually labelled "Media"; "Best time to post" is an inline hint strip, not a button inside a date picker.

**Real code to verify against:** the composer's editor component (confirm one shared editor, not per-platform tabs — note: there IS a real "Customise per platform" media-override feature per-tab for media files specifically, don't confuse this with the fictional per-platform *caption* customization the audit flagged; verify which is real), `handleSubmit`'s payload shape, the AI caption generation endpoint and its prompt (confirm single-caption, no-alternatives instruction), media upload validation (the real 50MB flat cap, accepted formats), the Schedule/approval routing logic (confirm no explicit "Send for approval" choice point).

**Shared facts block:** apply the full block; no single fact is central, but check for stray references.

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-06-compose.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`, `StatusBadge`. Remove the false auto-save claim entirely — do not replace it with a softened version, since no such mechanism exists at all. Remove the fictional hashtag-suggestion and per-platform-caption subsections, or rewrite them to describe only what's real (note: media-file per-platform override IS real and shipped — verify and keep that, distinct from caption customization). Resolve every Critical and Important finding; fix Minor findings where cheap.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-06-compose.tsx
git commit -m "docs(help): rewrite Compose section against real shipped behavior"
```

---

## Wave 4

### Task 10: Rewrite section-09-analytics.tsx

**Files:**
- Modify: `components/lyra/help/section-09-analytics.tsx`

**Current file text (for reference — implementer reads the real ~130-line file before starting; this is a "Phase 0" file, PR #49 already fixed the 2 narrow claims — Net New Followers metric, post-type in Top Posts — that originally triggered the audit; the rest is unfixed):** intro on cross-platform aggregation, hourly sync, "last sync" timestamp; "Overview metrics" via `MetricRow` x5 (Reach, Impressions, Engagements, Engagement Rate, Posts Published); "Platform breakdown" claiming click-to-drill-down cards; "Engagement chart" claiming per-platform legend toggle; "Top posts" table claiming click-to-drill-down rows; "Changing the date range" (7d/28d/3mo/6mo/12mo/custom options); "Data availability" (platform retention windows).

**Complete audit findings** (section-09-analytics.tsx — 2 Critical, 8 Important, 1 Minor; re-summarized findings, not split by severity label in the original report — treat all listed items as needing resolution):

> Fabricated interactive features — a click-to-drill-down post analytics panel and a platform-card drill-down view, neither of which exist (posts and platform cards are non-interactive). Wrong period options documented (7d/28d/3mo/6mo/12mo/custom) against the actual 3 fixed options (7d/30d/90d). An invented "last sync" timestamp display that's never rendered anywhere. A metric-list mismatch — Impressions, Engagements, and Engagement Rate are documented but not shown on the real dashboard, while Total Views and Response Rate are shown but undocumented. The "Net New Followers" metric described doesn't exist (no `followerCount` field anywhere in the schema) *(this specific claim was already removed in PR #49 — confirm it's gone, don't reintroduce it)*. Top Posts sort order and legend-toggle behavior described don't match the real chart's per-metric (not per-platform) series.

**Real code to verify against:** the analytics dashboard component (real metric list: Total Views, Response Rate, and whichever others are actually rendered — confirm exact set), the date-range selector (confirm exactly 3 options: 7d/30d/90d), the engagement chart's legend-toggle behavior (per-metric, not per-platform), the Top Posts table and post rows (confirm non-interactive), the platform breakdown cards (confirm non-interactive).

**Shared facts block:** apply the full block; no single fact is central here.

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-09-analytics.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `MetricRow`. Remove the fictional "last sync" timestamp claim and all click-to-drill-down claims. Fix the metric list to match what's actually rendered (verify the exact real set — don't guess Total Views/Response Rate are the complete real list without checking). Fix the date-range options to the real 3 (7d/30d/90d). Fix the legend-toggle description to per-metric, not per-platform.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-09-analytics.tsx
git commit -m "docs(help): rewrite Analytics section against real shipped behavior"
```

---

### Task 11: Rewrite section-03-social-connections.tsx

**Files:**
- Modify: `components/lyra/help/section-03-social-connections.tsx`

**Current file text (for reference — implementer reads the real ~245-line file before starting; this is a "Phase 0" file, PR #49 already fixed the single narrow claim about Instagram connect-order — the rest, including the Zernio custody claim, is unfixed):** intro claiming "LYRA stores only the OAuth access token... and uses it exclusively" (this is the wrong-custody claim — LYRA does NOT hold the token for Zernio-routed connections); "Supported platforms" via `PlatformRow` x6 (Facebook, Instagram, LinkedIn, Google Business, X, TikTok — no YouTube); "Connecting an account" 6-step flow claiming a page-picker step for Facebook/Google Business/LinkedIn; "Permissions LYRA requests by platform" via `PermRow` x5, omitting Facebook `business_management`/`ads_management` and X `offline.access`; "Reconnecting an expired account"; "Disconnecting an account" claiming "This immediately revokes LYRA's stored access token"; "Troubleshooting: Facebook says no Page was found"; "Connecting accounts on a client's behalf".

**Complete audit findings** (section-03-social-connections.tsx — 2 Critical, 4 Important, 5 Minor; see also the companion investigation `docs/investigations/2026-08-24-zernio-token-custody-findings.md` for full custody detail):

> **Critical:**
> 1. Privacy claim wrong: states LYRA is the sole custodian of OAuth tokens ("LYRA stores only the OAuth access token... and uses it exclusively") — the live connect flow routes through Zernio, a third party, which actually holds the tokens for every current connection. Several requested permission scopes (Facebook `business_management`/`ads_management`, X `offline.access`) are undisclosed anywhere in-app.
> 2. Instagram connect-order description is inverted, and the settings page's own copy ("Connected separately from Facebook") directly contradicts it *(this specific claim was already fixed in PR #49 — confirm it's correct, don't reintroduce the inversion)*.
>
> **Important:** YouTube is a fully shipped, connectable platform missing from the doc's platform list entirely (add a `PlatformRow` for it); disconnect claims tokens are "immediately revoked" — the code only sets `isActive: false`, the encrypted token row is retained (see shared fact 4); the page-picker step described for Facebook/Google Business/LinkedIn doesn't exist for the latter two, and the one real picker (`FacebookPagePicker`) is vestigial dead code on the current Zernio path; the Facebook troubleshooting steps contradict the live in-app error message, which explicitly tells users the issue is Zernio-side and not fixable via those steps.
>
> **Minor:** `rerequest=true` reconnect param is dead (nothing on the live path honors it); multi-workspace connections aren't flagged as separately billed Zernio accounts; a few smaller copy/label mismatches.

**Real code to verify against:** `services/social/provider/index.ts` (Zernio custody dispatch — every live connection routes through Zernio, LYRA never receives the token), the connect flow's OAuth scope requests per platform (confirm the undisclosed scopes), the disconnect handler (confirm `isActive: false` only, per shared fact 4), the Facebook Page-picker component (confirm vestigial/dead on the Zernio path), the live Facebook connect error copy (confirm it points to Zernio, not LYRA).

**Shared facts block:** apply the full block — fact 4 (disconnect doesn't revoke) is directly relevant.

**Note on scope:** this file's Critical finding #1 is a privacy/custody claim also being addressed in the (separately merged, not-yet-Richard-reviewed) Privacy Policy draft PR. This task only needs to fix THIS file's own claim to be accurate about Zernio custody — it does not need to duplicate the Privacy Policy's legal framing, just describe the real technical connect flow correctly (LYRA doesn't hold the token; Zernio does, for every current connection).

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-03-social-connections.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`, `StatusBadge`, and the file's own local `PlatformRow`/`PermRow` components. Fix the intro paragraph's custody claim to describe Zernio holding the tokens, not LYRA. Add a `PlatformRow` for YouTube. Fix the disconnect subsection per shared fact 4. Resolve every Critical and Important finding; fix Minor findings where cheap.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-03-social-connections.tsx
git commit -m "docs(help): rewrite Social Connections section against real shipped behavior"
```

---

### Task 12: Rewrite section-14-data-deletion.tsx

**Files:**
- Modify: `components/lyra/help/section-14-data-deletion.tsx`

**Current file text (for reference — implementer reads the real ~75-line file before starting):** intro on stored OAuth token + metadata for Facebook/Instagram; "Disconnect a social account" 4-step flow claiming "The stored token is deleted immediately"; "Request complete data deletion" via email request; "Delete your LYRA account" via "Account → Billing → Delete account", claiming "Active subscriptions are cancelled immediately with no further charges" and "all associated data — including all workspaces".

**Complete audit findings** (section-14-data-deletion.tsx — 3 Critical, 5 Important, 2 Minor; includes 1 real product bug — separately fixed in PR #56, but the documentation here was never updated to match either the old-broken or new-fixed reality):

> **Critical:**
> 1. "The stored token is deleted immediately" on disconnect is false, stated twice — the code only flips `isActive: false`; the encrypted token row (and refresh token, expiry, webhook ID) persists indefinitely. This is a compliance-facing page, making the same defect as section-03 materially worse here (see shared fact 4).
> 2. "Active subscriptions are cancelled immediately with no further charges" — this WAS false when the audit ran (no Stripe call existed in the deletion path), but **PR #56 fixed the underlying bug** (`app/api/account/route.ts` now cancels the Agency's Stripe subscription, `crisisAwareSubId`, and `Workspace.trendSubId` before the deletion transaction, when the deleting user is the last owner-role member). Verify PR #56's actual behavior against `app/api/account/route.ts` and update this claim to accurately describe the *current, fixed* behavior — including the real nuance that cancellation only happens when the user is the last owner-role member of their Agency (a non-last-owner's account deletion does NOT cancel the shared Agency subscription, correctly, since other owners still need it).
> 3. The navigation path to the delete-account control is wrong (doc says Account → Billing → Delete account; the real location is Account → Danger Zone, a different page).
>
> **Important:** "all associated data — including all workspaces" over-claims — only workspaces the user owns are destroyed, shared workspaces survive, and the route can hard-fail with a 500 if the user authored posts in a shared workspace (an unhandled foreign-key restriction — describe this as a real current limitation, don't imply it's handled gracefully); per-social-account scoped deletion is promised but no code can perform it — every deletion path is scoped to a whole workspace, never a single connected account; no Meta Data Deletion Request Callback endpoint exists (the doc's email-based process is an acceptable substitute per Meta's rules, but shouldn't be read as evidence a callback exists — reword to avoid that implication); the "three-dot menu" for disconnect doesn't exist (same defect as section-03, see shared fact 4); there's no confirmation dialog for disconnect at all, despite the doc describing a confirm step.
>
> **Minor:** the list of stored credential fields is incomplete (omits refresh token, webhook ID, and others — under-discloses what's actually retained; fix to be complete); "all data removed within 30 days" isn't literally true even on success (one orphaned table, `FacebookPending`, is never included in the deletion transaction — note this limitation rather than omitting it).
>
> **Confirmed accurate (keep as-is):** the note directing users to separately revoke access at the platform level (Facebook Business Integrations) is correct and important — there is genuinely no Graph API revocation call anywhere in the codebase, so this manual step really is the only way to fully revoke.

**Real code to verify against:** `app/api/account/route.ts` (the PR-#56-fixed deletion flow — subscription cancellation logic, last-owner-role check, workspace-scoping, the unhandled foreign-key-restriction 500 case), the disconnect handler (per shared fact 4), the `FacebookPending` table (confirm it's genuinely excluded from the deletion transaction).

**Shared facts block:** apply the full block — fact 4 (disconnect doesn't revoke) is directly relevant.

- [ ] **Step 1: Rewrite the file**

Rewrite `components/lyra/help/section-14-data-deletion.tsx` fully using `primitives.tsx`'s `SectionHeader`, `Subsection`, `Strong`, `Steps`/`Step`, `Note`. Fix the disconnect claim per shared fact 4. Fix the subscription-cancellation claim to describe PR #56's real current (fixed, but last-owner-scoped) behavior — verify the actual code rather than assuming full-and-unconditional cancellation. Fix the navigation path. Resolve every Critical and Important finding; fix Minor findings where cheap. Keep the "confirmed accurate" platform-revocation note as-is.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` from the `lyra` project root.
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/help/section-14-data-deletion.tsx
git commit -m "docs(help): rewrite Data Deletion section against real shipped behavior"
```

---

## Task 13: Cross-file consistency check, verification, and PR (done directly, not delegated)

**Files:** all 13 files touched by Tasks 0–12.

- [ ] **Step 1: Read all 13 changed files together**

Read `components/lyra/help/section-01-getting-started.tsx` through `section-14-data-deletion.tsx` (all 13, including Trends) in one pass. Check specifically:
- Does every file that mentions the workspace-editing screen, Guardrails, "Brand AI", disconnect behavior, or plan gating describe it identically (per the shared facts block)?
- No leftover "Brand Intelligence" as a nav-label reference (concept prose is fine).
- No leftover "Settings → General" or fictional Guardrails-config-screen claims anywhere.
- Consistent terminology for the AI Response Mode labels ("No reply" / "Post with approval" / "Full Automatic") everywhere they're mentioned.

Fix any inconsistency found directly (small, cross-file wording fixes — no new subagent dispatch needed for this).

- [ ] **Step 2: Typecheck and build**

Run `npx tsc --noEmit`, then a full production build with `npm run build` (defined in `package.json` as `next build`).
Expected: both pass with no new errors.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin <branch-name>
```

Open one PR covering all 13 files with a description summarizing what changed per file at a high level (one line per file is enough — e.g. "section-07-inbox.tsx: removed fictional Guardrails config screen, fixed platform ingestion list, documented real dead-code statuses accurately"). This is a normal "CI green, ready to merge" PR — none of this touches live legal text or financial logic, so it does not need the "NEEDS REVIEW, don't merge" framing the Privacy Policy PR required.

- [ ] **Step 4: Verify CI**

Confirm all CI checks pass on the PR before considering this task complete.

---

## Review process (applies to Tasks 1–12, per wave)

For each of Tasks 1–12, after the implementer commits:

1. **Spec-compliance review**: a fresh reviewer subagent checks every Critical/Important/Minor finding listed in that task against the rewritten file — confirmed fixed, or explicitly and reasonably deferred (not silently missed). Also checks the shared facts block was applied consistently (no reintroduction of "Brand Intelligence" as a label, no re-claiming a workspace-editing screen, etc.).
2. **Quality/accuracy review**: a fresh reviewer subagent (strong model — this review's entire purpose is catching fabrication, so don't under-resource it) independently re-reads a sample of the real feature code the file now makes claims about (fresh grep/read, not trusting the implementer's citations) and confirms at least 3-4 non-trivial claims per file actually hold. Also checks the file still renders coherently (no orphaned references, JSX matches `primitives.tsx`'s actual exported signatures).
3. Fix-and-re-review loops until both reviews are clean. Do not start the next wave until the current wave's 3 tasks are both spec-clean and accuracy-clean.

**Wave gating:** Wave 1 (Tasks 1-3) → Wave 2 (Tasks 4-6) → Wave 3 (Tasks 7-9) → Wave 4 (Tasks 10-12) → Task 13. Within a wave, the 3 tasks' implementers may be dispatched together (the files are fully independent, no shared state) — but do not start the next wave until the current wave's reviews are all clean.

**Model selection:** standard model for implementers; strong model for the quality/accuracy reviewer on every task (not just the legal/financial-adjacent ones — the anti-fabrication purpose applies equally to every file in this pass).

