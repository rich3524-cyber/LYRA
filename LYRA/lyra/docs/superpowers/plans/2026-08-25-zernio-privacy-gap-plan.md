# Zernio Privacy-Policy Gap Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 2 (Privacy Policy draft) produces a PR that must NOT be presented as "ready to merge" — it needs Richard's/legal review of the actual wording before it goes live. Every other task in this plan follows the normal CI-green pattern.**

**Goal:** Execute the 4 workstreams in `docs/superpowers/specs/2026-08-25-zernio-privacy-gap-design.md`, producing real findings and a draft Privacy Policy edit, not placeholders.

**Architecture:** Task 1 is a self-contained script. Task 2 (Privacy Policy draft) is sequenced after Task 1 since its exact wording depends on Task 1's result. Tasks 3–4 are pure documentation transcription (already drafted during brainstorming, no new investigation needed). Task 5 assembles everything into one consolidated report.

**Tech Stack:** Prisma (Task 1), a Next.js page component edit (Task 2), Markdown (Tasks 3–5).

---

## Task 1: Legacy native-provider account check

**Files:**
- Create: `scripts/check-legacy-social-accounts.ts`

- [ ] **Step 1: Write the script**

Create `scripts/check-legacy-social-accounts.ts`, following this repo's established one-off-script convention exactly (see `scripts/check-trend-subscriptions.ts` and `scripts/check-billing-bugs-live-impact.ts` — fresh `PrismaClient()`, no `lib/prisma.ts` import). This script only needs Prisma, no Stripe:

```typescript
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Identifies SocialAccount rows still on the native (non-Zernio) custody path --
// services/social/provider/index.ts's getProvider() falls back to nativeProvider
// whenever provider !== 'ZERNIO' or zernioAccountId is null, meaning LYRA itself
// (not Zernio) holds the real OAuth token for these accounts. Read-only -- does
// not modify anything. See docs/superpowers/specs/2026-08-25-zernio-privacy-gap-design.md.
async function main() {
  const legacyAccounts = await prisma.socialAccount.findMany({
    where: {
      OR: [
        { provider: { not: 'ZERNIO' } },
        { zernioAccountId: null },
      ],
    },
    select: {
      id: true,
      platform: true,
      provider: true,
      workspaceId: true,
      isActive: true,
      createdAt: true,
    },
  })

  console.log(`Found ${legacyAccounts.length} SocialAccount row(s) still on native (non-Zernio) custody.\n`)

  if (legacyAccounts.length === 0) {
    console.log('No legacy accounts found -- every SocialAccount row is on Zernio custody.')
  } else {
    const active = legacyAccounts.filter((a) => a.isActive)
    const inactive = legacyAccounts.filter((a) => !a.isActive)

    console.log(`  Active (live, currently in use): ${active.length}`)
    console.log(`  Inactive (disconnected/dead rows): ${inactive.length}\n`)

    const byPlatform = new Map<string, number>()
    for (const a of legacyAccounts) {
      byPlatform.set(a.platform, (byPlatform.get(a.platform) ?? 0) + 1)
    }
    console.log('  By platform:')
    for (const [platform, count] of byPlatform) {
      console.log(`    ${platform}: ${count}`)
    }

    if (active.length > 0) {
      console.log('\n  Active legacy accounts (LYRA itself holds a live token for these):')
      for (const a of active) {
        console.log(`    ${a.id} -- platform ${a.platform} -- workspace ${a.workspaceId} -- provider ${a.provider} -- connected ${a.createdAt.toISOString()}`)
      }
    }
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
```

- [ ] **Step 2: Typecheck**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Run it against real data**

```bash
npx tsx scripts/check-legacy-social-accounts.ts
```

Expected: real output — either "No legacy accounts found" or a real breakdown. **Record this exact output** — Task 2 needs it to pick the correct draft variant, and Task 5 needs it for the consolidated report.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-legacy-social-accounts.ts
git commit -m "chore: add script to check for accounts still on native (non-Zernio) token custody"
```

---

## Task 2: Privacy Policy disclosure draft

**Files:**
- Modify: `app/legal/privacy/page.tsx`

**This task produces a DRAFT for Richard's/legal review — not a normal ready-to-merge PR.** Say so explicitly in the commit message and (in Task 5's final step) in what gets reported back.

### Current state of the 3 affected sections (already confirmed accurate during brainstorming — verify by reading the file before editing, in case anything shifted)

**Section 1** (`app/legal/privacy/page.tsx`, inside the `<Section title="1. Information We Collect">` block):
```tsx
          <li><strong>Social media credentials</strong> — OAuth access tokens for connected social platforms (Facebook, Instagram, LinkedIn, Google Business, X, TikTok). These tokens are encrypted at rest using AES-256-GCM and are never exposed in API responses or logs.</li>
```

**Section 3** (inside `<Section title="3. Disclosure of Your Information">`):
```tsx
        <ul>
          <li><strong>Anthropic</strong> — to power AI caption, response, and SEO content generation.</li>
          <li><strong>Auth0</strong> — to manage authentication and user sessions.</li>
          <li><strong>Stripe</strong> — to process subscription payments.</li>
          <li><strong>Supabase / AWS</strong> — to store your data securely (database and file storage).</li>
          <li><strong>Social platforms</strong> — when you instruct us to publish content or retrieve data on your behalf.</li>
          <li><strong>Google</strong> — when you connect Google Search Console, to retrieve your site performance data.</li>
        </ul>
```

**Section 5** (inside `<Section title="5. Data Retention">`):
```tsx
        <ul>
          <li>Your account data and workspace data are deleted within 30 days</li>
          <li>Social media access tokens are deleted immediately</li>
          <li>Billing records are retained for 7 years as required by Australian tax law</li>
          <li>Anonymised, aggregated usage data may be retained indefinitely</li>
        </ul>
```

### Step 1: Pick the correct variant based on Task 1's actual result

**If Task 1 found ZERO legacy accounts** (every `SocialAccount` is on Zernio custody), use Variant A. **If Task 1 found ANY active legacy accounts**, use Variant B. Do not guess — use the real Task 1 output.

#### Variant A — zero legacy accounts

Replace the Section 1 credentials line with:

```tsx
          <li><strong>Social media credentials</strong> — to connect your social accounts, LYRA uses Zernio, a third-party social media API provider, which establishes and holds the OAuth connection to each platform (Facebook, Instagram, LinkedIn, Google Business, X, TikTok, YouTube) on our behalf. LYRA does not receive, store, or have access to the underlying platform access tokens for these connections.</li>
```

Add a new bullet to Section 3's list, after the "Social platforms" bullet:

```tsx
          <li><strong>Zernio</strong> — to establish and manage your connections to social media platforms. Zernio holds the underlying platform access credentials on our behalf and carries out the publishing, comment retrieval, and related actions LYRA instructs it to perform.</li>
```

Replace the Section 5 "deleted immediately" line with:

```tsx
          <li>Disconnecting a social account deactivates it within LYRA immediately; the underlying platform connection is managed by Zernio and is governed by Zernio's own data retention practices</li>
```

#### Variant B — some active legacy accounts found

Replace the Section 1 credentials line with:

```tsx
          <li><strong>Social media credentials</strong> — for most connected accounts, LYRA uses Zernio, a third-party social media API provider, which establishes and holds the OAuth connection to each platform (Facebook, Instagram, LinkedIn, Google Business, X, TikTok, YouTube) on our behalf; LYRA does not receive or store the underlying access token for these connections. For a small number of accounts connected before this arrangement, LYRA itself holds an encrypted OAuth access token directly, using AES-256-GCM encryption, never exposed in API responses or logs.</li>
```

Add the same new Zernio bullet to Section 3 as Variant A (identical text — copy it from Variant A above).

Replace the Section 5 "deleted immediately" line with:

```tsx
          <li>Disconnecting a social account deactivates it within LYRA immediately. For accounts connected via Zernio, the underlying platform connection is governed by Zernio's own data retention practices. For any account where LYRA holds the token directly, disconnecting deactivates the stored credential; the encrypted record itself is deleted when the account or workspace is deleted, per the retention terms above</li>
```

### Step 2: Also update the "Last updated" date

Change line 15 from:
```tsx
          Last updated: 18 May 2026
```
to:
```tsx
          Last updated: 25 Aug 2026 (draft — pending review)
```

The "(draft — pending review)" qualifier is deliberate and must stay in place until Richard/legal confirms the wording and removes it — this makes it visually obvious to anyone viewing the live page that this section is not yet finalized. Flag this explicitly in the PR description as something to remove once approved.

### Step 3: Typecheck

```bash
npx tsc --noEmit
```

Expected: no new errors.

### Step 4: Commit

```bash
git add app/legal/privacy/page.tsx
git commit -m "docs: draft Privacy Policy update disclosing Zernio (NEEDS RICHARD/LEGAL REVIEW BEFORE MERGE)"
```

Note the commit message's explicit all-caps flag — this is intentional, matching the "not ready to merge" framing this task requires throughout.

---

## Task 3: Meta App Review status question list (transcription only)

**Files:** none yet (content assembled into Task 5's consolidated report)

No new investigation needed — the design doc already confirmed during brainstorming that `services/social/zernio-client.ts` (the full Zernio API client) has no endpoint or stored data related to Zernio's own Meta App Review or Live Mode status. Carry forward this exact question list verbatim into Task 5's report:

```markdown
## Meta App Review status — questions for Zernio

Not answerable from this codebase (confirmed: no endpoint or stored data in `services/social/zernio-client.ts` or elsewhere relates to Zernio's own app-review status). Richard needs to ask Zernio directly (support, account rep, or their own dashboard):

1. Is Zernio's Meta app in Live Mode (not just Development Mode) for the Facebook/Instagram permissions LYRA actually uses (`pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, at minimum)?
2. Does that approval cover LYRA's specific use case, or is it a generic aggregator-level approval that doesn't guarantee LYRA's own features (e.g. comment auto-response) are covered?
3. If Zernio's Meta app were ever suspended or de-authorized by Meta, what's LYRA's exposure — does LYRA have any fallback, or does every connected Facebook/Instagram account stop working simultaneously?

Once answered, these determine whether `docs/platform-review/meta-app-review-guide.md` should be retired (if Zernio's approval is sufficient), kept active as a hedge (if LYRA wants its own approved app as insurance), or something in between.
```

---

## Task 4: Permission-scope re-derivation checklist (transcription only)

**Files:** none yet (content assembled into Task 5's consolidated report)

No new investigation needed — already scoped during brainstorming. Carry forward this exact checklist verbatim into Task 5's report:

```markdown
## Permission-scope re-derivation — checklist for Richard

The real OAuth scopes granted today are configured entirely in Zernio's own per-platform app settings — invisible to this codebase (LYRA's native scope lists in `services/social/*.ts` are dead code, unreachable from any live connect path). To get accurate numbers for a future Help-doc/Privacy-Policy update, pull this from Zernio, one row per platform:

| Platform | Exact scope/permission list Zernio's app requests | Zernio app in production/live mode for this platform? |
|---|---|---|
| Facebook | | |
| Instagram | | |
| LinkedIn | | |
| Google Business | | |
| X (Twitter) | | |
| TikTok | | |
| YouTube | | |

Source options: Zernio's own dashboard if it exposes this, or trigger a real connect flow for each platform and read the platform's own consent screen directly.

**This checklist's actual data is NOT filled in as part of this pass** — filling it in and updating the Help doc / Privacy Policy with real numbers is a follow-up task once Richard supplies this data.
```

---

## Task 5: Assemble the consolidated report, commit, push, open PR

**Files:**
- Create: `docs/investigations/2026-08-25-zernio-privacy-response.md`

- [ ] **Step 1: Write the consolidated report**

Create `docs/investigations/2026-08-25-zernio-privacy-response.md` with this structure — replace `[Task 1's real output]` and `[link to Task 2's PR]` with the actual results, not literal placeholder text:

```markdown
# Zernio Privacy-Policy Gap — Response

**Date:** 25 Aug 2026
**Source:** docs/investigations/2026-08-24-zernio-token-custody-findings.md
**Design:** docs/superpowers/specs/2026-08-25-zernio-privacy-gap-design.md

---

## Workstream 1 — Legacy native-provider account check

[Paste Task 1's actual script output here in full, not a summary]

## Workstream 2 — Privacy Policy disclosure draft

[Link to Task 2's PR once opened, e.g. "Draft PR: <url>"]. **This PR is explicitly NOT ready-to-merge** — it needs Richard's or a lawyer's review of the actual wording before it goes live. The "Last updated" line on the live page has been changed to include a "(draft — pending review)" marker as a visible signal until that review happens.

[Copy the exact variant (A or B) that was used, and note which one and why -- e.g. "Variant A used: Task 1 found zero legacy accounts."]

## Workstream 3 — Meta App Review status

[Paste Task 3's question list here in full]

## Workstream 4 — Permission-scope re-derivation

[Paste Task 4's checklist here in full]

---

## What Richard needs to do next

1. **Review and finalize the Privacy Policy draft** (Task 2's PR) — adjust wording as needed, decide whether to route through an actual lawyer, then remove the "(draft — pending review)" marker and merge.
2. **Ask Zernio the 3 questions in Workstream 3** about their Meta App Review status, then decide whether `docs/platform-review/meta-app-review-guide.md` should be retired, kept active, or updated.
3. **Pull the real per-platform scope data** for Workstream 4's checklist, then a follow-up pass can update the Help doc and Privacy Policy with accurate numbers.
```

- [ ] **Step 2: Verify no placeholder text survived**

```bash
grep -c "\[Task \|\[link to\|\[Paste\|\[Copy" docs/investigations/2026-08-25-zernio-privacy-response.md
```

Expected: `0`. If greater than 0, go back and fill in the real content before proceeding.

- [ ] **Step 3: Run the full test suite and typecheck**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
npx vitest run
npx tsc --noEmit
```

Expected: all tests pass (no regressions — this task touches no application code), no type errors.

- [ ] **Step 4: Commit, push, and open the PR for Task 1's script + Task 5's report**

These two can go on the same branch/PR (both are read-only findings/tooling, no legal-review caveat):

```bash
git add scripts/check-legacy-social-accounts.ts docs/investigations/2026-08-25-zernio-privacy-response.md
git commit -m "docs: consolidated Zernio privacy-response report and legacy-account check"
git push -u origin <branch-name>
```

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" pr create --repo rich3524-cyber/LYRA --base main --head <branch-name> \
  --title "docs: Zernio privacy-response findings + legacy-account check" \
  --body "Consolidated findings report per docs/superpowers/specs/2026-08-25-zernio-privacy-gap-design.md, plus the legacy-native-account triage script. The Privacy Policy draft itself is a SEPARATE PR (linked in the report) that needs Richard's/legal review before merge -- this PR is just the script and the findings report, safe to merge normally."
```

- [ ] **Step 5: Open Task 2's Privacy Policy PR separately, with explicit non-merge framing**

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" pr create --repo rich3524-cyber/LYRA --base main --head <privacy-policy-branch-name> \
  --title "docs: DRAFT Privacy Policy update disclosing Zernio (NEEDS REVIEW, DO NOT MERGE YET)" \
  --body "Draft update to app/legal/privacy/page.tsx disclosing Zernio as a data-sharing party, per docs/superpowers/specs/2026-08-25-zernio-privacy-gap-design.md and the findings in docs/investigations/2026-08-24-zernio-token-custody-findings.md.

**This is a draft for Richard's and/or legal review — not ready to merge as-is.** The live page's 'Last updated' line has been marked '(draft — pending review)' as a visible signal. Please review the actual wording (Section 1 credentials description, Section 3's new Zernio disclosure bullet, Section 5's corrected retention claim) before merging, and remove the draft marker once approved."
```

- [ ] **Step 6: Watch CI on both PRs, then report to Richard**

Both PRs should go through the normal CI checks (lint/typecheck/test/build), since neither introduces broken code — only the second PR's *content* needs human legal judgment, not its code correctness. Once both are green, report clearly to Richard: the findings-report PR is safe to merge whenever; the Privacy Policy PR needs his (or a lawyer's) read on the actual wording first, and should not be treated as a routine merge.
