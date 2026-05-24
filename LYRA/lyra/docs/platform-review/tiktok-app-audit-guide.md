# TikTok Content Posting API — App Audit Guide for LYRA

> **Purpose:** Set up a TikTok developer app and complete the audit process to allow LYRA to publish videos to TikTok on behalf of customers.
>
> **Who completes this:** Richard Unwin (business owner). Developer env var steps at the end.
>
> **Time required:** 1–2 hours to configure. TikTok's audit is less predictable than Google or Meta — allow 2–8 weeks. Start now.
>
> **Note on scope:** TikTok's API currently supports video publishing only — no comment reading or response via the public API. LYRA's TikTok integration is therefore post scheduling only (no inbox features). This is consistent with the TikTok service already built.

---

## Why This Is Necessary

TikTok's developer platform requires apps to pass a manual **audit** before production scopes (`video.publish`, `video.upload`) are granted to real users. Before audit approval, only sandbox accounts specifically added to your app can connect — identical to Meta's Development Mode.

LYRA needs three scopes:
- `user.info.basic` — Read the user's TikTok display name and avatar (auto-approved, no audit needed)
- `video.upload` — Upload video files to TikTok servers prior to publishing
- `video.publish` — Publish the uploaded video as a TikTok post

Both `video.upload` and `video.publish` require audit approval.

---

## Step 1: Create a TikTok Developer Account

1. Go to [developers.tiktok.com](https://developers.tiktok.com) and click **Log in**.
2. Log in with a TikTok account you own (the LYRA business TikTok account if you have one, or your personal account as the developer).
3. Complete account setup if prompted.

---

## Step 2: Create the LYRA App

1. In the developer portal, go to **Manage Apps → Create App**.
2. Fill in:
   - **App Name:** LYRA
   - **App Category:** Social Media Management or Productivity (choose whichever fits best)
   - **Platform:** Web
3. Submit.

You'll land on your app's dashboard. Note the **Client Key** and **Client Secret** — you'll need these for Netlify env vars.

---

## Step 3: Configure the App

### 3.1 Add the App Icon and Description

1. In your app dashboard → **Basic Information**.
2. Upload the LYRA logo as the App Icon (square, 512×512px recommended).
3. **App Description:** Write a clear description of LYRA. Suggested text:

> LYRA is a social media management platform for marketing agencies and businesses. It allows users to schedule and publish content across multiple platforms, including TikTok, from a single dashboard. LYRA publishes video content on behalf of authenticated TikTok users who have explicitly granted access.

4. **App Website URL:** `https://lyraonline.ai`
5. **Privacy Policy URL:** `https://lyraonline.ai/privacy`
6. **Terms of Service URL:** `https://lyraonline.ai/terms`

### 3.2 Add the Redirect URI

1. Find the **Redirect URI / OAuth redirect domain** section.
2. Add: `https://lyraonline.ai/api/social/callback/tiktok`
3. Also add for local testing: `http://localhost:3000/api/social/callback/tiktok`

### 3.3 Add Required Scopes (Products)

1. Go to the **Products** or **Scopes** section of your app dashboard.
2. Add these three scopes:
   - `user.info.basic` (auto-approved)
   - `video.upload` (requires audit)
   - `video.publish` (requires audit)

For each scope that requires audit, TikTok will ask for a justification.

---

## Step 4: Justify Each Scope

### `user.info.basic`

**Justification:**
> LYRA uses the user's display name and avatar to show which TikTok account is connected in the workspace settings screen.

This scope is auto-approved — no review required.

### `video.upload`

**Justification:**
> LYRA uses `video.upload` to transfer video files to TikTok's servers as the first step in a two-phase publishing flow. Users upload a video in LYRA's post composer, and LYRA uses this scope to stage the video on TikTok in preparation for publishing.

### `video.publish`

**Justification:**
> LYRA uses `video.publish` to publish staged videos as TikTok posts at the user's scheduled time. Users configure their post content, caption, and publish time in LYRA's content calendar. LYRA publishes on their behalf at the scheduled time. All publishing is performed at the explicit direction of the authenticated account owner.

---

## Step 5: Submit for Audit

Once all scope justifications are filled in:

1. Locate the **Submit for Audit** button in your app dashboard.
2. Before submitting, TikTok may ask you to provide a **demo video** showing the app in use. See the screencast guidance below.
3. Submit the audit.

### Screencast guidance

Record a short video (under 5 minutes) showing:
1. A user clicking "Connect" on the TikTok card in LYRA's workspace settings
2. The TikTok OAuth consent screen (showing the requested permissions)
3. The user approving access and being redirected back to LYRA
4. The TikTok account appearing as connected in LYRA's settings
5. (If possible) A video being composed in LYRA and scheduled for a TikTok account
6. (If possible) The video appearing on the TikTok account

> Use a test TikTok account for the screencast — do not use a real customer's account.

### Sandbox mode during audit

While the audit is pending, add test TikTok accounts to your app's sandbox:
1. In your app dashboard → **Sandbox → Add User**.
2. Add the TikTok username of any account you want to use for testing.

Sandbox users can complete the full OAuth flow and publish posts to their TikTok account for testing purposes before the audit is approved.

---

## Step 6: Add Environment Variables to Netlify

Add these to **Netlify → your site → Site configuration → Environment variables**:

| Variable | Value |
|---|---|
| `TIKTOK_CLIENT_KEY` | The Client Key from your TikTok app dashboard |
| `TIKTOK_CLIENT_SECRET` | The Client Secret from your TikTok app dashboard |

Trigger a Netlify redeploy after adding them.

---

## Step 7: Test Before Audit Completes

1. Add your own TikTok account as a sandbox user (Step 5).
2. In LYRA, go to workspace settings and click **Connect** on the TikTok card.
3. Complete the TikTok OAuth flow.
4. Confirm your TikTok account appears as connected in LYRA.

If TikTok shows an error about redirect URIs, double-check the redirect URI in Step 3.2 matches exactly what's in Netlify (`TIKTOK_CLIENT_KEY` must also be set).

---

## TikTok-Specific Notes

**Token expiry:** TikTok access tokens expire in **24 hours**. Refresh tokens expire in **365 days**. This is much shorter than other platforms. LYRA's token refresh job (part of the BullMQ worker build) must handle TikTok refresh aggressively — refresh tokens at the 20-hour mark to prevent posting failures.

**Video requirements:** TikTok has strict video format requirements for the Content Posting API:
- Format: MP4 or WebM
- Duration: 3 seconds to 10 minutes (depending on account standing)
- File size: Under 4GB
- Aspect ratio: 9:16 recommended (vertical), 1:1 or 16:9 also supported

LYRA's composer should surface these requirements when a user selects TikTok as a publishing destination.

**Comment API:** TikTok does not offer a public comment reading or reply API via the Content Posting API product. The inbox/AI response features are therefore **not available for TikTok** — this is a platform limitation, not a LYRA limitation. No competitor has solved this either.

---

## Audit Timeline and What to Expect

TikTok's audit process is the least predictable of all platforms:
- **Best case:** 2–3 weeks
- **Typical:** 4–6 weeks
- **Possible:** Up to 8+ weeks if TikTok comes back with questions

TikTok reviewers may ask for additional information, screenshots, or a revised description. Respond promptly.

If the audit is rejected, TikTok will give a reason. Common rejection reasons:
- The demo video doesn't clearly show the scope being used
- The app description doesn't clearly explain the publishing use case
- The privacy policy URL returns an error or is incomplete

---

## Checklist Summary

- [ ] TikTok developer account created at developers.tiktok.com
- [ ] LYRA app created with correct name, category, and platform
- [ ] App icon, description, website, privacy policy, terms of service filled in
- [ ] Redirect URIs added (production + local)
- [ ] Three scopes added: user.info.basic, video.upload, video.publish
- [ ] Scope justifications written for video.upload and video.publish
- [ ] `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` added to Netlify env vars
- [ ] Netlify redeployed
- [ ] Own TikTok account added as sandbox user for testing
- [ ] TikTok connection tested end-to-end with sandbox account ✅
- [ ] Screencast recorded showing OAuth flow + video publishing
- [ ] App submitted for audit
- [ ] Monitoring TikTok developer portal and email for audit feedback
- [ ] Post-audit: tested with a non-sandbox TikTok account
