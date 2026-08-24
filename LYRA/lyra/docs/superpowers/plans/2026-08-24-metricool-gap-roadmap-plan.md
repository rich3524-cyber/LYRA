# Metricool Gap-Closure Roadmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement Phase 0 (Tasks 1–8) task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Phases 1–9 below are deliberately NOT bite-sized — each needs its own `superpowers:brainstorming` pass before it gets a plan like this one. Do not attempt to execute the Phase 1–9 sections as if they were tasks.

**Goal:** Fix the live, actively-wrong product surface identified in `docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md` Phase 0 (LYRA Assistant placeholder shown as real, 4 Help articles describing non-existent features, orphaned Trend-addon Stripe subscriptions, Wishlist drift), and record the scoped-but-not-yet-planned roadmap for Phases 1–9.

**Architecture:** Phase 0 is copy/nav/content-only changes across 5 existing files plus one new diagnostic script — no schema, no new routes, no new dependencies. Phases 1–9 are listed for continuity but intentionally left at spec-level detail, per the design doc's own instruction.

**Tech Stack:** Next.js App Router (TSX components), a static HTML reference doc, a one-off TypeScript script run via `tsx` against the Stripe SDK, and a Markdown backlog file.

---

## Test approach for Phase 0

This codebase has no existing test files for `components/lyra/app-shell/*` or `components/lyra/help/*` (confirmed: `find components/lyra/app-shell components/lyra/help -name "*.test.*"` returns nothing) — these are static nav/copy components with no test convention to extend. Writing new snapshot/unit tests asserting on hardcoded JSX strings would be busywork with no precedent in this codebase and no real regression value. Per each task below, verification is instead: a `grep` step proving the exact old text is gone (or the exact new text is present), plus running the full existing suite (`npx vitest run`) and `npx tsc --noEmit` at the end to prove nothing broke elsewhere. This is the TDD principle (prove the change happened, prove nothing else broke) adapted to a codebase area with no test harness to write into — not a shortcut around it.

---

## Task 1: Create the feature branch

**Files:** none (git operation only)

- [ ] **Step 1: Create and switch to the branch**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
git checkout main
git pull origin main
git checkout -b fix/metricool-gap-phase-0
```

Expected: branch created from up-to-date `main`.

---

## Task 2: Remove LYRA Assistant from the sidebar nav

**Files:**
- Modify: `LYRA/lyra/components/lyra/app-shell/sidebar.tsx:40` (nav item entry) and `:105,140-169` (special-case render branch)

The route itself (`app/(dashboard)/workspace/[workspaceId]/assistant/page.tsx`) stays — its placeholder copy is already honest once nothing is actively promoting it as real. Only the nav entry and its special purple-bordered render branch are removed.

- [ ] **Step 1: Remove the nav item entry**

In `LYRA/lyra/components/lyra/app-shell/sidebar.tsx`, delete line 40 from the `navItems` array:

```tsx
  { href: '/assistant',    label: 'LYRA Assistant', icon: Sparkles,      proOnly: false },
```

So the array's last two entries become:

```tsx
  { href: '/seo',          label: 'SEO',            icon: Search,        proOnly: false },
]
```

- [ ] **Step 2: Remove the `isAssistant` special-case branch**

In the same file, delete the `isAssistant` declaration (currently line 105):

```tsx
      const isAssistant = href === '/assistant'
```

Then delete the entire `if (isAssistant) { ... }` block (currently lines 140–169):

```tsx
      if (isAssistant) {
        return (
          <div key={label} className="pt-3">
            <Link
              href={fullHref}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 group border',
                isActive
                  ? 'bg-purple-500/10 border-purple-500/70 text-purple-300'
                  : 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/60 hover:text-purple-300',
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
          </div>
        )
      }
```

- [ ] **Step 3: Check whether `Sparkles` is still used elsewhere in the file**

```bash
grep -n "Sparkles" "LYRA/lyra/components/lyra/app-shell/sidebar.tsx"
```

Expected: no matches (it was only used for the Assistant nav icon). If none, remove `Sparkles` from the `lucide-react` import block at the top of the file.

- [ ] **Step 4: Verify the removal**

```bash
cd "LYRA/lyra"
grep -n "assistant\|isAssistant\|LYRA Assistant" components/lyra/app-shell/sidebar.tsx
```

Expected: no output.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: no new errors.

```bash
git add components/lyra/app-shell/sidebar.tsx
git commit -m "fix: remove LYRA Assistant from sidebar nav (unbuilt feature shown as real)"
```

---

## Task 3: Correct the Demo Guide's 4 LYRA Assistant references

**Files:**
- Modify: `LYRA/docs/LYRA-Demo-Reference-Guide.html` (4 locations: line 429 feature table, lines 448–454 walkthrough step 01, line 618 plan comparison, lines 804–810 shipped-features list)

- [ ] **Step 1: Fix the feature overview table row (currently line 429)**

Find:

```html
          <tr><td><strong>LYRA Assistant</strong></td><td>Quarterly performance review + 3-month AI content strategy. One click to generate, one click to export as PDF.</td></tr>
```

Replace with (matching the existing Trend Hub row's own "not yet shipped" pattern, two rows below it):

```html
          <tr><td><strong>LYRA Assistant</strong></td><td><em>Not yet shipped.</em> Planned — quarterly performance review + 3-month AI content strategy, one click to generate and export as PDF.</td></tr>
```

- [ ] **Step 2: Remove walkthrough step 01 and renumber 02–07 down to 01–06**

Find the entire step 01 block (currently lines 448–454):

```html
      <li>
        <span class="step-num">01</span>
        <div class="step-content">
          <p class="step-title">LYRA Assistant — "Open with the Payoff"</p>
          <p class="step-body">Start here — it lands immediately. Navigate to the Assistant tab and click <strong>Generate Report</strong>. In ~30 seconds LYRA analyses the last 90 days across every connected platform and produces: a <strong>Quarterly Review</strong> (total posts, avg engagement rate, best platform, top content theme, AI-written performance narrative, per-platform breakdown) and a <strong>3-Month Forward Strategy</strong> (content pillars, key dates with campaign ideas, recommended posting frequency per platform — for each of the next three months). Show the <strong>Export PDF</strong> button — one click and it's a client-ready document. <strong>Key point:</strong> no spreadsheets, no manual data pulls, no writing. A quarterly review that would take a junior account manager a day is done in 30 seconds.</p>
        </div>
      </li>
```

Delete it entirely, then renumber every subsequent `<span class="step-num">` in this list: `02`→`01`, `03`→`02`, `04`→`03`, `05`→`04`, `06`→`05`, `07`→`06`. Step 08 (LYRA Trend, already correctly marked "not yet available") stays `08` — do not renumber it, since it's already grouped with the other not-yet-shipped item and there's no step 07 conflict once 07 (Analytics + Reports) becomes 06.

Wait — after renumbering 02–07 down to 01–06, the existing step 08 (Trend) must become **07** to keep the sequence contiguous (01 through 07, with 07 being "not yet available — do not demo"). Renumber it too: `08` → `07`.

- [ ] **Step 3: Remove the LYRA Assistant mention from the Pro plan feature list (currently line 618)**

Find:

```html
            <td>Full brand intelligence, AI response drafts, content scoring, repurposing, SEO, LYRA Assistant, email marketing calendar, Crisis Aware (paid add-on)</td>
```

Replace with:

```html
            <td>Full brand intelligence, AI response drafts, content scoring, repurposing, SEO, email marketing calendar, Crisis Aware (paid add-on)</td>
```

- [ ] **Step 4: Delete the "recently shipped" feature-row for LYRA Assistant (currently lines 804–810)**

This list only contains genuinely-shipped items (each row above and below it describes something real and live) — an unbuilt feature doesn't belong here at all, unlike the feature-overview table in Step 1 which catalogs the whole product including what's planned. Delete the entire block:

```html
      <div class="feature-row">
        <span class="feature-pnum" style="color: #a78bfa;">★</span>
        <div>
          <p class="feature-title">LYRA Assistant — Quarterly Review &amp; Strategy</p>
          <p class="feature-desc">One-click AI quarterly review: 90-day performance analysis across all platforms + a 3-month forward content strategy with content pillars, key dates, and per-platform posting frequency. Exportable as a client-ready PDF. Pro and Agency.</p>
        </div>
      </div>
```

- [ ] **Step 5: Verify the removal**

```bash
grep -n "LYRA Assistant" "LYRA/docs/LYRA-Demo-Reference-Guide.html"
```

Expected: no output at all — every mention was either corrected to "not yet shipped" language (Step 1) or removed (Steps 2–4). Re-check Step 1's output specifically:

```bash
grep -n "Not yet shipped" "LYRA/docs/LYRA-Demo-Reference-Guide.html"
```

Expected: two matches — the existing Trend Hub row and the newly-corrected LYRA Assistant row.

```bash
grep -n 'class="step-num"' "LYRA/docs/LYRA-Demo-Reference-Guide.html"
```

Expected: exactly 7 matches, numbered `01` through `07` with no gaps or repeats.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing"
git add LYRA/docs/LYRA-Demo-Reference-Guide.html
git commit -m "fix: correct Demo Guide's 4 LYRA Assistant references (unbuilt feature shown as real)"
```

---

## Task 4: Fix the Analytics Help section

**Files:**
- Modify: `LYRA/lyra/components/lyra/help/section-09-analytics.tsx:45-48` (Net New Followers metric) and `:88` (post-type mention)

- [ ] **Step 1: Remove the "Net New Followers" MetricRow**

In `LYRA/lyra/components/lyra/help/section-09-analytics.tsx`, delete:

```tsx
          <MetricRow metric="Net New Followers">
            Followers gained minus followers lost in the selected period, per platform.
            A positive number indicates audience growth.
          </MetricRow>
```

(This is the entire block between the `Engagement Rate` and `Posts Published` `MetricRow`s — remove only this block, leaving its neighbors intact.)

- [ ] **Step 2: Fix the Top Posts list item**

Find:

```tsx
          <li>Platform icon and post type (feed, reel, story, etc.)</li>
```

Replace with:

```tsx
          <li>Platform icon</li>
```

- [ ] **Step 3: Verify**

```bash
cd "LYRA/lyra"
grep -n "Net New Followers\|post type" components/lyra/help/section-09-analytics.tsx
```

Expected: no output.

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: no new errors.

```bash
git add components/lyra/help/section-09-analytics.tsx
git commit -m "fix: remove Help doc claims of follower tracking and post-type analytics that don't exist yet"
```

---

## Task 5: Fix the Compose Help section

**Files:**
- Modify: `LYRA/lyra/components/lyra/help/section-06-compose.tsx:100-103`

- [ ] **Step 1: Remove the carousel-reorder paragraph**

In `LYRA/lyra/components/lyra/help/section-06-compose.tsx`, delete:

```tsx
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          For Instagram carousel posts, drag the uploaded images to reorder them before scheduling.
          The first image is the cover shown in the feed.
        </p>
```

Leave the surrounding paragraphs (the "remove a wrongly-attached file" paragraph before it, and the "Customise per platform" paragraph after it) untouched.

- [ ] **Step 2: Verify**

```bash
cd "LYRA/lyra"
grep -n "reorder" components/lyra/help/section-06-compose.tsx
```

Expected: no output.

- [ ] **Step 3: Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: no new errors.

```bash
git add components/lyra/help/section-06-compose.tsx
git commit -m "fix: remove Help doc claim of carousel image reordering (no reorder code exists)"
```

---

## Task 6: Fix the Social Connections Help section

**Files:**
- Modify: `LYRA/lyra/components/lyra/help/section-03-social-connections.tsx:56-61`

- [ ] **Step 1: Correct the Instagram capability description**

Find:

```tsx
          <PlatformRow name="Instagram" availability="Full">
            Instagram Business and Creator accounts connected to a Facebook Page are fully
            supported. Scheduling feed posts, reels, carousels, and stories; reading and
            responding to comments; and accessing insights. Instagram is connected through the
            same Facebook Graph API connection — you connect Facebook first, and Instagram pages
            linked to that account become available automatically.
          </PlatformRow>
```

Replace with:

```tsx
          <PlatformRow name="Instagram" availability="Full">
            Instagram Business and Creator accounts connected to a Facebook Page are fully
            supported. Scheduling feed posts and multi-image carousels; reading and
            responding to comments; and accessing insights. Instagram is connected through the
            same Facebook Graph API connection — you connect Facebook first, and Instagram pages
            linked to that account become available automatically.
          </PlatformRow>
```

(Carousels stay in the description — multi-image posts do publish correctly via Zernio's `mediaItems` array today, just without per-slide ordering/ALT/product tags. Reels and Stories are removed since neither is supported as a distinct post type yet.)

- [ ] **Step 2: Verify**

```bash
cd "LYRA/lyra"
grep -n "reels, carousels, and stories" components/lyra/help/section-03-social-connections.tsx
```

Expected: no output.

```bash
grep -n "feed posts and multi-image carousels" components/lyra/help/section-03-social-connections.tsx
```

Expected: one match.

- [ ] **Step 3: Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: no new errors.

```bash
git add components/lyra/help/section-03-social-connections.tsx
git commit -m "fix: correct Help doc's Instagram capability list (no reels/stories scheduling yet)"
```

---

## Task 7: Identify pre-cutoff Trend add-on Stripe subscriptions

**Files:**
- Create: `LYRA/lyra/scripts/check-trend-subscriptions.ts`

This script only **identifies** affected subscriptions — per the design doc, the actual refund-or-pause decision needs Richard's sign-off before anything is cancelled or refunded, so this does not modify any Stripe or database state.

- [ ] **Step 1: Write the script**

Create `LYRA/lyra/scripts/check-trend-subscriptions.ts`, following this repo's existing one-off-script convention exactly (see `scripts/tmp-check-lyra-approvers.ts`): a fresh `PrismaClient()` instantiated directly, not the app's `lib/prisma.ts` singleton, and likewise a fresh `Stripe` client rather than the app's `lib/stripe.ts` wrapper — existing scripts never import from `lib/` or use the `@/` path alias, and this one shouldn't be the first to.

```typescript
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'

const prisma = new PrismaClient()
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-07-29.dahlia' })

// Identifies workspaces with a live Stripe subscription against the Trend add-on
// price (monthly or annual) even though the feature was never built and its
// checkout route now returns 503. Read-only -- does not cancel or refund anything.
// See docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md, Phase 0.
async function main() {
  const trendPriceIds = [
    process.env.STRIPE_TREND_PRICE_ID,
    process.env.STRIPE_TREND_ANNUAL_PRICE_ID,
  ].filter((id): id is string => Boolean(id))

  if (trendPriceIds.length === 0) {
    console.error('Neither STRIPE_TREND_PRICE_ID nor STRIPE_TREND_ANNUAL_PRICE_ID is set — nothing to check.')
    process.exit(1)
  }

  console.log(`Checking for active subscriptions against price IDs: ${trendPriceIds.join(', ')}\n`)

  const affected: Array<{ subscriptionId: string; customerId: string; workspaceName: string; status: string; currentPeriodEnd: string }> = []

  for (const priceId of trendPriceIds) {
    let startingAfter: string | undefined
    for (;;) {
      const page = await stripe.subscriptions.list({
        price: priceId,
        status: 'all',
        limit: 100,
        starting_after: startingAfter,
      })

      for (const sub of page.data) {
        if (sub.status !== 'active' && sub.status !== 'trialing' && sub.status !== 'past_due') continue

        const customer = await stripe.customers.retrieve(sub.customer as string)
        const workspace = await prisma.workspace.findFirst({
          where: { stripeCustomerId: sub.customer as string },
          select: { name: true },
        })

        affected.push({
          subscriptionId: sub.id,
          customerId: sub.customer as string,
          workspaceName: workspace?.name ?? '(no matching LYRA workspace found)',
          status: sub.status,
          currentPeriodEnd: new Date(sub.items.data[0]?.current_period_end * 1000).toISOString(),
        })
      }

      if (!page.has_more) break
      startingAfter = page.data[page.data.length - 1]?.id
    }
  }

  if (affected.length === 0) {
    console.log('No active/trialing/past_due subscriptions found against the Trend add-on prices.')
  } else {
    console.log(`Found ${affected.length} subscription(s) needing a decision (refund vs. pause):\n`)
    for (const a of affected) {
      console.log(`  Subscription ${a.subscriptionId} — customer ${a.customerId} — workspace "${a.workspaceName}" — status ${a.status} — current period ends ${a.currentPeriodEnd}`)
    }
    console.log('\nThis script does not cancel or refund anything. Decide refund vs. pause per subscription, then act via the Stripe dashboard or a follow-up script once decided.')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
```

- [ ] **Step 2: Confirm `Workspace.stripeCustomerId` is the correct field name**

```bash
cd "LYRA/lyra"
grep -n "stripeCustomerId" prisma/schema.prisma
```

Expected: a match on the `Workspace` model. If the actual field name differs, update the script's `prisma.workspace.findFirst` `where` clause to match before proceeding.

- [ ] **Step 3: Typecheck the script**

```bash
npx tsc --noEmit
```

Expected: no new errors. `tsconfig.json`'s `include` is `**/*.ts`, so `scripts/check-trend-subscriptions.ts` is covered by this same command — no separate invocation needed.

- [ ] **Step 4: Run it against real Stripe data (requires `.env.local` with real `STRIPE_SECRET_KEY`)**

```bash
npx tsx scripts/check-trend-subscriptions.ts
```

Expected: either "No active/trialing/past_due subscriptions found" or a list of affected subscriptions. **This step needs to actually run against production Stripe data — flag its output to Richard rather than silently proceeding**, since deciding refund vs. pause per subscription is explicitly his call per the design doc.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-trend-subscriptions.ts
git commit -m "chore: add script to identify pre-cutoff Trend add-on Stripe subscriptions"
```

---

## Task 8: Add Wishlist pointer notes

**Files:**
- Modify: `LYRA/docs/LYRA-Wishlist.md` (4 locations: line 16 item 14, lines 73-74 item 2, lines 76-77 item 3, lines 93-94 item 6)

- [ ] **Step 1: Add a pointer under item 14 (Analytics dashboard — depth)**

Find (currently line 16, in the "From Phase 2 — Intelligence" table):

```markdown
| 14 | **Analytics dashboard — depth** | Partially there now: platform breakdown, top posts (by reach/views), and an engagement trend chart all exist and are verified live. Still missing: follower growth over time (no `followerCount` field in the schema yet — nothing to chart) and true reach *estimates* vs. actual reach. |
```

Replace with:

```markdown
| 14 | **Analytics dashboard — depth** | Partially there now: platform breakdown, top posts (by reach/views), and an engagement trend chart all exist and are verified live. Still missing: follower growth over time (no `followerCount` field in the schema yet — nothing to chart) and true reach *estimates* vs. actual reach. Sequenced as Phase 5 in `lyra/docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md`, expanded to include basic demographics. |
```

- [ ] **Step 2: Add a pointer under item 2 (Client portal)**

Find (currently lines 73-74):

```markdown
**2. Client portal**
The client approval workflow was built (Session 38) but clients have no interface to use it from. Agencies need a stripped-down client-facing view where clients can see their content calendar, approve or reject pending posts, and read AI draft responses — without accessing the full LYRA dashboard. The data model (`ClientAccess`, `WorkspaceAccess`, `PostApproval`) is already in place. This is the UI layer that makes the approval workflow usable in the real world.
```

Replace with:

```markdown
**2. Client portal** — *rescoped, see note*
The client approval workflow was built (Session 38) but clients have no interface to use it from. The data model (`ClientAccess`, `WorkspaceAccess`, `PostApproval`) is already in place.

**Rescoped 24 Aug 2026:** `lyra/docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md` (Phase 3) replaces this full-portal design with a cheaper email-link approval flow — reviewers approve/reject directly from the review email using the existing `OnboardingToken` model, no LYRA account needed (matching Metricool's own design). The original full-portal scope described above is demoted to a later upsell, not deleted.
```

- [ ] **Step 3: Add a pointer under item 3 (Team member invitations)**

Find (currently lines 76-77):

```markdown
**3. Team member invitations**
The schema supports roles (`AGENCY_ADMIN`, `CLIENT_APPROVE`, `SMB_OWNER`) and `WorkspaceAccess` records, but there is no UI to invite someone to a workspace or grant them a role. Currently the only way to add a team member is a direct database insert. Agencies have teams. This needs an invite-by-email flow with role selection.
```

Replace with:

```markdown
**3. Team member invitations**
The schema supports roles (`AGENCY_ADMIN`, `CLIENT_APPROVE`, `SMB_OWNER`) and `WorkspaceAccess` records, but there is no UI to invite someone to a workspace or grant them a role. Currently the only way to add a team member is a direct database insert. Agencies have teams. This needs an invite-by-email flow with role selection.

Sequenced as Phase 2 in `lyra/docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md`, after Post Types (Phase 1) — design unchanged from the description above.
```

- [ ] **Step 4: Add a pointer under item 6 (Email digest)**

Find (currently lines 93-94):

```markdown
**6.** 📄 **Email digest** — *not yet designed*
Weekly (or configurable) summary email per workspace sent to the workspace owner: posts published, comments responded to by AI, drafts waiting for review, crisis events, and the top-performing post of the week. Keeps agency owners and their clients informed without requiring a login. Pairs directly with the autonomous mode value proposition — if LYRA is working while you sleep, you need a morning report. Also unblocks the Slack "weekly digest" event, dropped from item 8's build specifically because this didn't exist yet. Brainstorming for this had just started (11 Aug 2026) when the session paused for a laptop switch — no design questions asked yet.
```

Replace with:

```markdown
**6.** 📄 **Email digest** — *not yet designed*
Weekly (or configurable) summary email per workspace sent to the workspace owner: posts published, comments responded to by AI, drafts waiting for review, crisis events, and the top-performing post of the week. Keeps agency owners and their clients informed without requiring a login. Pairs directly with the autonomous mode value proposition — if LYRA is working while you sleep, you need a morning report. Also unblocks the Slack "weekly digest" event, dropped from item 8's build specifically because this didn't exist yet. Brainstorming for this had just started (11 Aug 2026) when the session paused for a laptop switch — no design questions asked yet.

Sequenced as Phase 4 in `lyra/docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md`. Its brainstorm resumes from where it left off — no new design decisions introduced by that roadmap doc.
```

- [ ] **Step 5: Verify all 4 pointers landed**

```bash
grep -c "metricool-gap-roadmap-design.md" "LYRA/docs/LYRA-Wishlist.md"
```

Expected: `4`.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing"
git add LYRA/docs/LYRA-Wishlist.md
git commit -m "docs: point Wishlist items 2, 3, 6, 14 at the new gap-closure roadmap"
```

---

## Task 9: Full verification, push, and open the PR

**Files:** none (verification and git operations only)

- [ ] **Step 1: Run the full test suite**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
npx vitest run
```

Expected: all existing tests still pass (666/666 as of the last full run this session — confirm the count matches or exceeds that, since Phase 0 adds no new tests).

- [ ] **Step 2: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: succeeds. (Use the same placeholder env vars pattern from `.github/workflows/deploy.yml` if building locally without real secrets configured.)

- [ ] **Step 4: Push the branch**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing"
git push -u origin fix/metricool-gap-phase-0
```

- [ ] **Step 5: Open the PR**

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" pr create --repo rich3524-cyber/LYRA --base main --head fix/metricool-gap-phase-0 \
  --title "fix: Metricool gap-closure roadmap, Phase 0 (doc & help-content correctness)" \
  --body "Implements Phase 0 of docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md: removes LYRA Assistant from the sidebar nav and the Demo Guide (unbuilt feature was being shown/demoed as real), corrects 3 Help articles describing non-existent features (follower tracking, post-type analytics, carousel reordering, reels/stories scheduling), adds a read-only script to identify pre-cutoff Trend add-on Stripe subscriptions needing Richard's refund/pause decision, and points Wishlist items 2/3/6/14 at the new roadmap doc."
```

- [ ] **Step 6: Watch CI to green**

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" pr checks <PR-number> --repo rich3524-cyber/LYRA
```

Poll until `Lint & type-check`, `Test`, `Build`, and `Secret Scan` all show `pass`. Fix and push any failures before considering Phase 0 done.

- [ ] **Step 7: Flag the two manual items to Richard**

Once CI is green, tell Richard directly (not just in the PR description):
1. The output of Task 7 Step 4 (`check-trend-subscriptions.ts`) — needs his refund-vs-pause decision per affected subscription before any Stripe action is taken.
2. This PR is ready to merge whenever he's ready (matching this project's established pattern of Richard doing the actual merge).

---

## Phases 1–9 — roadmap only, not planned

Everything below is carried forward from `docs/superpowers/specs/2026-08-24-metricool-gap-roadmap-design.md` for continuity. **None of it is bite-sized, and none of it should be executed as a task list** — each phase needs its own `superpowers:brainstorming` pass, producing its own design doc, before it gets a plan like the one above.

### Phase 1 — Post Types

**Covers:** extending `Post` beyond `content` + `mediaUrls[]` to support Stories, Reels-as-type, first-class carousels (slide order, per-slide ALT, product tags), first comment, LinkedIn documents, X/Threads/Bluesky threads.

**Blocked on, before a plan can exist:** (1) an MVP-scope decision — full per-platform parity vs. a smaller first slice; (2) confirming what Zernio's API actually accepts per post-type, which could materially change what's buildable; (3) a composer UI design pass for post-type selection and per-type fields.

**Unblocks:** Phase 5's story/reel metrics; the UTM-automation sliver already in Wishlist item 12.

### Phase 2 — Team member invitations (Wishlist item 3)

**Covers:** invite-by-email flow with role selection, replacing the current direct-database-insert-only path.

**Blocked on:** nothing structural — the data model (`WorkspaceAccess`, role enum) already exists. Lower design risk than Phase 1; likely close to plannable as-is when its turn comes, still needs a short brainstorm to confirm the invite-email flow and expiry/security model for invite tokens.

### Phase 3 — Client approval by email link (rescoped Wishlist item 2)

**Covers:** reviewers approve/reject directly from a link in the review email, no LYRA account, built on the existing `OnboardingToken` model.

**Blocked on, before a plan can exist:** (1) whether to also build the read-only shared-calendar link and client-self-connect link in the same phase or split them out; (2) the token expiry/security model for an approval link specifically, since it grants a write action (approve/reject), a different trust profile than the existing read-only onboarding token.

### Phase 4 — Email digest (Wishlist item 6)

**Covers:** weekly/configurable per-workspace summary email — posts published, AI responses sent, drafts awaiting review, crisis events, top post of the week.

**Blocked on:** resuming the brainstorm paused 11 Aug 2026 — no design decisions were made before it paused, so this needs a fresh brainstorming session, not a resumed plan.

### Phase 5 — Follower growth + basic demographics (Wishlist item 14, expanded)

**Covers:** a `followerCount` field (doesn't exist today), possibly demographics fields, a daily collection job, a growth-over-time chart.

**Blocked on, before a plan can exist:** confirming exactly what Zernio's API exposes per platform for follower counts and demographics — this determines feasibility and shape before any schema work starts.

**Blocked on Phase 1:** story/reel-specific metrics need a post-type concept to attach to first.

### Phase 6 — Media Library

**Covers:** S3-backed browsable media library (upload once, reuse across posts), composer + bulk-import picker integration; unlocks Canva sync (item 14) and evergreen recycling (item 9).

**Blocked on, before a plan can exist:** reading the existing Phase 3 reference in `2026-05-19-ai-content-schedule-design.md` first, then deciding whether Canva sync and recycling ship in the same phase or as immediate follow-ons.

### Phase 7 — Read-only ads reporting

**Covers:** extending the existing single-boosted-post `getBoostReach()` read path (`services/social/meta-ads.ts`) into real ads-performance reporting alongside organic metrics. Explicitly no spend, checkout, or budget-management surface.

**Blocked on:** a brainstorm to scope exactly which ad metrics to surface and where (own dashboard panel vs. folded into existing Analytics).

### Phase 8 — Report delivery: scheduled email + shareable links

**Covers:** automatic monthly email delivery of the existing branded PDF report (Wishlist item 19), plus a read-only shareable report link as an alternative to a PDF attachment.

**Blocked on:** nothing structural — extends an already-shipped feature. Still needs a short brainstorm for the delivery-scheduling mechanism and link-expiry model.

### Phase 9 — New networks: Pinterest, Threads, Bluesky (Wishlist items 17c–17e)

**Covers:** connect-route wiring and a service file per platform (matching `services/social/linkedin.ts`'s pattern), for platforms where the Zernio slug mapping already exists.

**Blocked on:** Bluesky specifically needs research into AT Protocol app-password auth (not OAuth) and whether comment monitoring is viable, before it can be scoped like Pinterest and Threads.
