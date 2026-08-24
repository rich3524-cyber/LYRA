# Zernio Token-Custody Investigation — Findings

**Date:** 24 Aug 2026
**Trigger:** Found during Phase 0 code-quality review of `components/lyra/help/section-03-social-connections.tsx` (Metricool gap-closure roadmap, PR #49).
**Status:** Fact-finding only — no decision made here. See "Options" section at the end.

---

## Technical custody facts

**Confirmed: LYRA's connect-initiation flow always routes through Zernio for every platform it currently supports a connect route for.**

`app/api/social/connect/[platform]/route.ts` (the only live "Connect" entry point reachable from the UI) unconditionally does: create/reuse a Zernio profile for the workspace (`services/social/zernio-connect.ts::ensureZernioProfile`) → `zernioClient.getConnectUrl(zernioPlatform, zernioProfileId, redirectUrl)` → redirect the user to Zernio's hosted `authUrl`. This applies to every route id in `services/social/provider/platform-map.ts`'s `ROUTE_TO_ZERNIO` map: `facebook`, `instagram` (via Facebook), `linkedin`, `google` (→ Google Business), `twitter`, `tiktok`, `youtube`. `zernioClient.getConnectUrl` (in `services/social/zernio-client.ts`) sends only `profileId` and `redirect_url` to Zernio — **no OAuth scope parameter is ever passed by LYRA's code.** Zernio's own OAuth apps/dashboard, not LYRA, determine what scopes are actually requested from the platform. This is not auditable from this codebase.

The callback (`app/api/zernio/connect/callback/route.ts`) confirms the DB write: on success it upserts `SocialAccount` with `accessToken: null`, `provider: 'ZERNIO'`, and `zernioAccountId: resolvedAccountId`. This holds for **every** platform going through this callback, since it's the single shared handler keyed off `fromZernioPlatform(matchedAccount.platform)` — there is no per-platform branching that would let one platform store a raw token while another doesn't. Confirmed in `prisma/schema.prisma`: `SocialAccount.accessToken` and `.refreshToken` are both nullable, and are `null` on the Zernio path; `zernioAccountId` (nullable) is the field actually populated. **LYRA's code never receives, logs, or transiently handles the raw platform OAuth token anywhere in the Zernio connect/callback/publish/comment/review flow** — every provider call (`services/social/provider/zernio.ts`) sends only `zernioAccountId` to Zernio's API; the platform token itself never crosses into LYRA.

**The custody answer is genuinely split by account, not just by platform, and this split is currently live, not hypothetical:**

- **New/reconnected accounts (all 7 routable platforms — Facebook, Instagram, LinkedIn, Google Business, X/Twitter, TikTok, YouTube):** Zernio holds the actual OAuth token. LYRA stores only `zernioAccountId`. `services/social/provider/index.ts::getProvider` dispatches these to `zernioProvider`.
- **Legacy/native accounts:** `getProvider` explicitly falls back to `nativeProvider` (`services/social/provider/native.ts`) whenever `provider !== 'ZERNIO'` OR `zernioAccountId` is null — the code comment documents this as intentional, covering both true pre-migration native accounts and a backfill artifact where the `provider` column was defaulted to `'ZERNIO'` without ever completing a real Zernio connect. For these accounts, `SocialAccount.accessToken`/`.refreshToken` hold the actual encrypted platform OAuth token, and `nativeProvider.publish`/`.replyToComment` call the Graph API / LinkedIn API / Twitter API directly using that decrypted token — i.e., LYRA genuinely does hold custody of the raw token for these accounts.
- Whether any such legacy/native accounts still exist in production (vs. all having been migrated) cannot be determined from the codebase alone — it requires a database query (`SELECT platform, provider, zernioAccountId IS NULL FROM "SocialAccount"`), which this investigation did not run.

**All native OAuth *connect-initiation* code is dead code today.** `services/social/facebook.ts`, `linkedin.ts`, `tiktok.ts`, `twitter.ts`, `google-business.ts` each still export a live `getAuthUrl` function, and `services/social/oauth-connect.ts` + `app/api/social/callback/[platform]/route.ts` still exist and would wire them up — but nothing in the live UI or any route generates a link to that native flow anymore. `components/lyra/settings/facebook-connect-button.tsx` (the only connect button found) points at `/api/social/connect/facebook` (the Zernio route) for both "Connect" and "Reconnect". A repo-wide search found zero live callers of `facebook.getAuthUrl`, `linkedin.getAuthUrl`, `tiktok.getAuthUrl`, `google.getAuthUrl`, or `twitter.getAuthUrl` anywhere in the codebase — not even in `oauth-connect.ts`, which wires up the code-exchange side of native OAuth (`exchangeCode`, `getLongLivedToken`, etc.) but never calls `getAuthUrl` itself; the only other match is `twitter.test.ts`'s own unit test. The `FacebookPagePicker`/`fbpending` UI in the settings page is similarly vestigial — nothing in the current Zernio callback ever sets the `fbpending` query param that would trigger it. **Practical implication: the native scope lists below describe what LYRA's own code *would* request if this dead path were reactivated — not what is presented to a user connecting or reconnecting an account today.**

Note also: the settings page's own error-handling copy (`app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`) already surfaces Zernio by name to end users on failure — e.g. *"Zernio couldn't find a Facebook Page to connect... This is confirmed to be an issue on Zernio's side, not something fixable from LYRA or your Facebook settings — contact Zernio support..."* — so the product is not hiding Zernio's existence from users encountering an error; it simply is never mentioned anywhere in the Help documentation or (per below) the Privacy Policy's OAuth-token description.

## Privacy policy — current state

Live page: `app/legal/privacy/page.tsx`, rendered at `/legal/privacy`. Last updated 18 May 2026. Verbatim relevant text:

**Section 1, "Information We Collect":**
> "**Social media credentials** — OAuth access tokens for connected social platforms (Facebook, Instagram, LinkedIn, Google Business, X, TikTok). These tokens are encrypted at rest using AES-256-GCM and are never exposed in API responses or logs."

**Section 3, "Disclosure of Your Information"** — the complete list of parties data is shared with:
> "We share your personal information only with:
> - **Anthropic** — to power AI caption, response, and SEO content generation.
> - **Auth0** — to manage authentication and user sessions.
> - **Stripe** — to process subscription payments.
> - **Supabase / AWS** — to store your data securely (database and file storage).
> - **Social platforms** — when you instruct us to publish content or retrieve data on your behalf.
> - **Google** — when you connect Google Search Console, to retrieve your site performance data.
>
> We do not sell, rent, or trade your personal information to third parties for marketing purposes. We do not share your data with any party not listed above unless required by law or with your explicit consent."

**Section 4, "Data Storage and Security":**
> "AES-256-GCM encryption for all stored social media access tokens... Access tokens are never logged or returned in API responses."

**Section 5, "Data Retention":**
> "Social media access tokens are deleted immediately" (on account deletion).

**Verdict: Zernio is not disclosed anywhere in the Privacy Policy, and there is no generic "third-party service providers" or "sub-processor" catch-all clause that could be read to cover it.** Section 3's disclosure list is closed and specific ("We share your personal information only with:" followed by six *named* parties, then an explicit statement that no other party receives data "unless required by law or with your explicit consent"). Zernio is not one of the six named parties. Given the custody facts above — Zernio holds the actual OAuth tokens for every newly-connected account across all six platforms this section calls out by name (Facebook, Instagram, LinkedIn, Google Business, X, TikTok) — this section's closed list is factually incomplete for any workspace using the current (Zernio) connect flow. Separately, Section 1's claim that access tokens are "encrypted at rest using AES-256-GCM" and Section 4's "never logged or returned in API responses" is accurate for the tokens LYRA itself stores (`lib/encrypt.ts` AES-256-GCM, confirmed used in `oauth-connect.ts` and native provider paths) but says nothing about what happens to the token on Zernio's side, which the policy doesn't address at all because it doesn't know Zernio is in the chain.

## Permission scope audit

| Platform | Scopes LYRA's *native* code would request (dead code today — `services/social/*.ts`) | Scopes disclosed in-app (Help doc, `components/lyra/help/section-03-social-connections.tsx`) | Scopes actually granted live today | Gap |
|---|---|---|---|---|
| Facebook / Instagram | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_read_user_content`, `business_management`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `ads_management` (`services/social/facebook.ts`) | `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments` | **Not visible from this codebase** — determined entirely by Zernio's own Meta app configuration | Native list has 6 undisclosed scopes (`pages_show_list`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_read_user_content`, `business_management`, `ads_management`) vs. the Help doc — but this native list is dead code, not what's live. Live/actual scopes are unknowable from the repo. |
| LinkedIn | `r_organization_social`, `w_organization_social`, `rw_organization_admin` (`services/social/linkedin.ts`) | `r_organization_social`, `w_organization_social`, `r_basicprofile` | Not visible — Zernio-controlled | Native third scope (`rw_organization_admin`, an *admin* grant) doesn't match the documented third scope (`r_basicprofile`, a read-only profile grant) at all — and again, dead code vs. an unauditable live reality. |
| Google Business | `https://www.googleapis.com/auth/business.manage` (`services/social/google-business.ts`) | `business.manage` | Not visible — Zernio-controlled | None between native code and doc (they match) — but still unauditable live, since the connect route never reaches this native code. |
| X (Twitter) | `tweet.read`, `tweet.write`, `users.read`, `offline.access` (`services/social/twitter.ts`) | `tweet.read`, `tweet.write`, `users.read` | Not visible — Zernio-controlled | Native list adds `offline.access` (a long-lived/refresh-token grant), undisclosed in the Help doc — again dead code, live reality unknown. |
| TikTok | `user.info.basic`, `user.info.profile`, `user.info.stats` (`services/social/tiktok.ts`) | `video.publish`, `video.list`, `comment.list`, `comment.post` | Not visible — Zernio-controlled | Native scopes and documented scopes are **entirely disjoint sets** — the native code (dead) doesn't even request publish/comment scopes, while the Help doc claims exactly those. Neither may reflect what Zernio actually requests live. |

**Key structural finding for this section:** because every live connect goes through Zernio and LYRA's `getConnectUrl` call carries no scope parameter, **the actual scopes presented to a user on the platform's consent screen today are configured entirely on Zernio's side and are not present anywhere in the LYRA codebase.** The native `SCOPES` constants above are accurate reflections of what the prior code review flagged, and they do match its description of the gaps — but attributing them to "what LYRA currently requests" would be incorrect, since that code path is not reachable from any live UI action found in this investigation. The only way to know what's actually granted today is to inspect Zernio's own app/dashboard configuration for each platform, or capture a live consent-screen screenshot per platform.

There is no in-app pre-connect consent/permission screen for LinkedIn, TikTok, X, or Google Business — only Facebook has one (`components/lyra/settings/facebook-connect-button.tsx`'s "Before connecting Facebook" modal, which itself doesn't enumerate scopes, just says "leave every permission and every Page checkbox turned on").

## Meta App Review guide — relevant excerpts and whether affected

`docs/platform-review/meta-app-review-guide.md` (found at this path, not `docs/meta-app-review-guide.md`) is **substantially affected by the custody finding above** and should be treated as unreliable/stale until reconciled.

The guide's stated premise directly contradicts the confirmed live routing:
> "**Who completes this:** Richard Unwin (business owner). The developer portions are already complete — **the code requests the correct scopes** and has demonstrable features built."

> "6. Save the configuration. Note the **Configuration ID**... 7. **The developer will add this Configuration ID to the `getAuthUrl` function in `services/social/facebook.ts`.**"

Both statements assume LYRA's own native Facebook Login app (`services/social/facebook.ts`) is the live connect path that Meta would be reviewing. Per the custody finding above, `getAuthUrl` in `facebook.ts` has no live caller — the actual connect flow goes through Zernio's OAuth app, not LYRA's. This means:

- If LYRA proceeds through this guide's steps (Meta Business Verification, requesting Advanced Access on LYRA's own app, wiring a Configuration ID into `facebook.ts::getAuthUrl`), it would move **LYRA's own dormant Meta app** to Live Mode — but since nothing calls that code path today, this would have **no effect on what real customers experience**, because they're going through Zernio's app, not LYRA's.
- Conversely, whatever permission state actually gates real customers today is **Zernio's own Meta App Review status**, which this guide never mentions and which this codebase cannot confirm one way or the other.
- The guide's screencast script (Step 4, `pages_show_list` section) describes "3. The Facebook consent screen listing Pages" as if it's LYRA's own consent screen — but if Zernio's OAuth app is what's presented, the screencast would need to demonstrate Zernio's Meta app screen, not LYRA's, for the review to be evaluating the actual live flow.

The document does not touch on token custody or data-handling representations to Meta (it's entirely about scope justification and screencasts), so the custody and privacy-policy findings above don't directly contradict its content — only its foundational assumption about *whose* app is being reviewed is affected. Whether this guide needs a rewrite, whether Zernio's own app is already Meta-approved (making this guide moot), or whether LYRA genuinely still needs its own app reviewed for some other reason (e.g. covering the legacy/native accounts identified above) is unknown from this codebase and would need direct confirmation — from Zernio (is their Meta app in Live Mode for these permissions?) or from whoever last touched this guide.

## Options

These are neutral, non-exhaustive paths forward. No option is recommended; the choice belongs to the business/legal owner.

- **Option A — Correct only the Help doc's wording, no other gap exists.** Applies only if it turns out Zernio's own privacy/data-processing terms already satisfy LYRA's sub-processor disclosure obligations by some other existing mechanism (e.g. a signed DPA referencing Zernio that isn't reflected in the public-facing policy), and the business judges that a wording fix to `components/lyra/help/section-03-social-connections.tsx` (removing or qualifying "LYRA stores only the OAuth access token") is sufficient.

- **Option B — Privacy Policy needs an explicit third-party sub-processor disclosure covering Zernio.** Section 3's closed "we share your personal information only with" list would need a new named entry for Zernio, and Section 1/4's description of token handling would need to reflect that Zernio, not LYRA, holds custody of the actual platform OAuth token for every current connection.

- **Option C — Scope disclosure needs to be re-derived from Zernio's actual configuration, not LYRA's dead native code.** Since the live scopes are entirely determined by Zernio's own app registrations (unauditable from this repo), the Help doc's "Permissions LYRA requests by platform" section would need source data pulled from Zernio (their dashboard, their docs, or a live consent-screen capture per platform) rather than continuing to reflect LYRA's dormant native `SCOPES` constants, which may no longer be accurate to what's actually granted.

- **Option D — Reconcile or retire the Meta App Review guide, and separately determine whether legacy native-provider accounts still exist.** The guide's premise (LYRA's own Meta app governs live scopes) needs to be checked against reality (does it, for any current customer, or is Zernio's app the only one that matters); and a database check for any `SocialAccount` rows still on `provider != 'ZERNIO' OR zernioAccountId IS NULL` would clarify whether the native-token-custody scenario described in the Technical custody facts section is still live in production or purely historical.
