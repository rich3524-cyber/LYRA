# Zernio Privacy-Policy Gap — Response

**Date:** 25 Aug 2026
**Source:** docs/investigations/2026-08-24-zernio-token-custody-findings.md
**Design:** docs/superpowers/specs/2026-08-25-zernio-privacy-gap-design.md

---

## Workstream 1 — Legacy native-provider account check

Script: `scripts/check-legacy-social-accounts.ts`. Went through one round of review that added a cross-check (see commit `e178340`) before this result was trusted for Workstream 2's wording decision.

Real output, run twice independently (once by the implementer, once by a reviewer, both against live production data):

```
Found 0 SocialAccount row(s) still on native (non-Zernio) custody.

No legacy accounts found -- every SocialAccount row is on Zernio custody.

Cross-check: Zernio-custody accounts that ALSO still carry a stored token: 0
```

**Conclusion: every current `SocialAccount` row is genuinely Zernio-custody only, with zero exceptions and zero leftover tokens on migrated rows.** This is a strong, twice-confirmed result — Workstream 2's Privacy Policy draft used the Zernio-only wording (Variant A), not the mixed-custody wording (Variant B).

## Workstream 2 — Privacy Policy disclosure draft

**Draft PR: opened separately from this report's PR (see "How this was delivered" below) — this content lives on `app/legal/privacy/page.tsx`, is NOT yet merged, and should NOT be treated as ready-to-merge.**

Variant A used (per Workstream 1's confirmed zero-legacy-accounts result). The draft went through two real review rounds before reaching its current state — the first found and fixed a genuine factual error (an early draft incorrectly replaced a TRUE account-deletion fact with a disconnect fact, conflating two different user actions — `app/api/account/route.ts` really does hard-delete `SocialAccount` rows on account deletion) plus disclosed that LYRA cannot revoke Zernio's OAuth grant on either disconnect or deletion (Zernio's API has no revoke/disconnect method at all), reworded a Section 4 claim that had fallen into contradiction with the new Section 1 language, added an APP 8 overseas-processing disclosure, reordered Section 3, and added Resend (a previously-missing party in the same closed disclosure list — same defect class as the Zernio gap, closed in the same pass). A second review round caught and fixed one remaining scope gap (the revoke-disclosure only mentioned deletion, not disconnect) — fixed directly after that round.

**Changes made** (`app/legal/privacy/page.tsx`):
- **Section 1** — rewritten to disclose that Zernio establishes and holds the OAuth connection for all 7 platforms (Facebook, Instagram, LinkedIn, Google Business, X, TikTok, YouTube — YouTube newly added, was missing from the original list), and that LYRA never receives or stores those tokens directly.
- **Section 3** — new "Zernio" bullet added (placed before "Social platforms," which itself is reworded to reflect that LYRA reaches platforms indirectly via Zernio); new "Resend" bullet added (a pre-existing, separate gap in the same closed list, found and closed in the same pass).
- **Section 4** — reworded to scope the AES-256-GCM/no-logging claims to tokens LYRA genuinely stores directly (Google Search Console), no longer implying social-platform tokens are among them; added a line disclosing that some providers, including Zernio, may process data outside Australia (APP 8).
- **Section 5** — restored the true account-deletion fact (social media connection records are deleted), added a clearly separate bullet distinguishing disconnect from deletion, and added a paragraph disclosing that LYRA cannot revoke Zernio's platform-side authorization on either disconnect or deletion, directing users to each platform's own connected-apps settings to fully revoke access.
- **Header** — "Last updated" changed to "25 Aug 2026 (draft — pending review)" — this marker is deliberate and must be manually removed once Richard/legal approves the wording; it should not go live with the marker still present.

## Workstream 3 — Meta App Review status

Not answerable from this codebase (confirmed: no endpoint or stored data in `services/social/zernio-client.ts` or elsewhere relates to Zernio's own app-review status). Richard needs to ask Zernio directly (support, account rep, or their own dashboard):

1. Is Zernio's Meta app in Live Mode (not just Development Mode) for the Facebook/Instagram permissions LYRA actually uses (`pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, at minimum)?
2. Does that approval cover LYRA's specific use case, or is it a generic aggregator-level approval that doesn't guarantee LYRA's own features (e.g. comment auto-response) are covered?
3. If Zernio's Meta app were ever suspended or de-authorized by Meta, what's LYRA's exposure — does LYRA have any fallback, or does every connected Facebook/Instagram account stop working simultaneously?

Once answered, these determine whether `docs/platform-review/meta-app-review-guide.md` should be retired (if Zernio's approval is sufficient), kept active as a hedge (if LYRA wants its own approved app as insurance), or something in between.

## Workstream 4 — Permission-scope re-derivation

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

## How this was delivered

Two separate PRs, deliberately:
- **This report + the Workstream 1 script** — normal PR, safe to merge once CI is green (read-only script, a Markdown findings report — no legal-judgment content).
- **The Privacy Policy draft** (Workstream 2) — its own PR, explicitly titled and described as NOT ready to merge, pending Richard's/legal's review of the actual wording.

---

## What Richard needs to do next

1. **Review and finalize the Privacy Policy draft.** Beyond the wording itself, two specific open questions surfaced during review that only Richard can answer:
   - **Is there a signed Data Processing Agreement (DPA) with Zernio?** The draft's "Zernio holds credentials on our behalf" phrasing is the correct legal formulation *if* a DPA exists — if it doesn't, that's worth addressing (with Zernio directly) before or alongside publishing this disclosure, not just a wording concern.
   - Two minor, non-blocking notes from the final review worth considering, not required fixes: Section 1 doesn't separately name the Google Search Console OAuth token LYRA does hold directly (it's covered in Section 4, but a reader hits "we never store tokens" in Section 1 first); and Section 4's overseas-processing line names only Zernio when Anthropic, Auth0, Stripe, and Resend are also overseas recipients — technically accurate as written, but a stylistic/completeness call for whoever finalizes the wording.
   - Once approved, remove the "(draft — pending review)" marker from the Last-updated line before merging.
2. **Ask Zernio the 3 questions in Workstream 3** about their Meta App Review status, then decide whether `docs/platform-review/meta-app-review-guide.md` should be retired, kept active, or updated.
3. **Pull the real per-platform scope data** for Workstream 4's checklist, then a follow-up pass can update the Help doc and Privacy Policy with accurate numbers.
