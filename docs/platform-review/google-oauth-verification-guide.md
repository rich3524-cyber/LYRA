# Google OAuth Verification — Google Business Profile + YouTube

> **Purpose:** Set up the Google Cloud project and complete OAuth app verification so LYRA can connect Google Business Profile locations and YouTube channels for any customer — not just test users.
>
> **Covers both:** Google Business Profile and YouTube. They share one Google Cloud project and one OAuth consent screen.
>
> **Who completes this:** Richard Unwin (Google account owner). The developer steps at the end require the Client ID and Secret to be added to Netlify env vars.
>
> **Time required:** 1–2 hours to configure. Google's verification review takes 1–2 weeks. Unverified apps can connect up to 100 test users in the meantime.

---

## Why This Is Necessary

Google OAuth apps start in "Testing" mode. In Testing mode, only accounts explicitly added as test users can complete the OAuth flow — exactly the same constraint as Meta's Development Mode. Publishing and verifying the app moves it to production so any Google account holder can connect.

LYRA needs verification for two sensitive scopes:
- `https://www.googleapis.com/auth/business.manage` — Google Business Profile locations
- `https://www.googleapis.com/auth/youtube` and `https://www.googleapis.com/auth/youtube.upload` — YouTube channel publishing

Both require Google to verify that the app is legitimate before granting them to the public.

---

## Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and log in with the LYRA Google account (or a Google account you own as the business).
2. Click the project dropdown at the top → **New Project**.
3. Name it **LYRA** and click **Create**.
4. Make sure this project is selected in the dropdown for all subsequent steps.

---

## Step 2: Enable the Required APIs

You need to enable three APIs in this project.

### 2.1 Google Business Profile API

1. In the left sidebar → **APIs & Services → Library**.
2. Search for **Google Business Profile API**.
3. Click it → **Enable**.

> If you cannot find it, search for "My Business". The API may appear as "My Business Account Management API" and "My Business Business Information API" — enable both.

### 2.2 YouTube Data API v3

1. Back in **APIs & Services → Library**.
2. Search for **YouTube Data API v3**.
3. Click it → **Enable**.

---

## Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Select **External** (so any Google account can connect, not just accounts in your Google Workspace).
3. Click **Create**.

### App information

Fill in these fields exactly:

- **App name:** LYRA
- **User support email:** richunwin3524@gmail.com (or a support email)
- **App logo:** Upload the LYRA logo (square, min 120×120px, max 1MB)
- **App domain → Application home page:** `https://lyraonline.ai`
- **App domain → Application privacy policy link:** `https://lyraonline.ai/privacy` (create this page if it doesn't exist — it is required)
- **App domain → Application terms of service link:** `https://lyraonline.ai/terms` (same — required)
- **Authorized domains:** Click **Add domain** → enter `lyraonline.ai`
- **Developer contact information:** richunwin3524@gmail.com

Click **Save and Continue**.

### Scopes

Click **Add or Remove Scopes**.

Add these scopes:
- `https://www.googleapis.com/auth/business.manage`
- `https://www.googleapis.com/auth/youtube`
- `https://www.googleapis.com/auth/youtube.upload`

Also add these non-sensitive scopes (already approved automatically):
- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`

Click **Update**, then **Save and Continue**.

### Test users

While in Testing mode, add yourself and any testers:

1. Click **Add Users**.
2. Add: `richunwin3524@gmail.com` and any other email addresses that should be able to connect during testing.
3. Click **Save and Continue**.

---

## Step 4: Create OAuth Credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: **LYRA Web Client**.
5. Under **Authorised redirect URIs**, click **Add URI** and add:
   - `https://lyraonline.ai/api/social/callback/google`
   - `https://lyraonline.ai/api/social/callback/youtube`
   - `http://localhost:3000/api/social/callback/google` (for local dev)
   - `http://localhost:3000/api/social/callback/youtube` (for local dev)
6. Click **Create**.

Google will show you the **Client ID** and **Client Secret**. Copy both immediately and store them securely — you'll need them for Step 6.

---

## Step 5: Submit for OAuth Verification

Once the consent screen is configured and you've tested the connection with your test user accounts, submit for verification.

1. Go to **APIs & Services → OAuth consent screen**.
2. The app should show **Publishing status: Testing**.
3. Click **Publish App** — this triggers the verification process.

> Google will immediately ask whether you want to prepare for verification. If you have sensitive scopes (which LYRA does), you **must** complete verification before the app can be used by more than 100 test users.

### Verification form

Google will ask you to complete a verification form. Prepare the following:

**Authorised domains:** `lyraonline.ai`

**Use case description (copy and adapt):**

> LYRA is a social media management SaaS platform for marketing agencies, freelancers, and small businesses. It allows users to schedule content, generate AI captions, and manage comment responses across multiple platforms including Google Business Profile and YouTube.
>
> LYRA uses `business.manage` to connect Google Business Profile locations so users can respond to Google reviews and schedule Google Business posts on behalf of their clients. This is a core feature of the product — review response on Google is one of LYRA's primary value propositions.
>
> LYRA uses `youtube` and `youtube.upload` to publish video content to YouTube channels on behalf of users who have authenticated and granted access. All publishing is performed at the explicit direction of the authenticated account holder.

**Screencast requirements:**

Google requires a video demonstrating each sensitive scope in use. Record separate short screencasts (under 5 minutes each) for:

1. **`business.manage`** — Show a user clicking "Connect" on the Google Business card in LYRA settings → the Google OAuth consent screen → being redirected back → the Business Profile location appearing as connected in LYRA.

2. **`youtube` / `youtube.upload`** — Show a user clicking "Connect" on the YouTube card → the Google OAuth consent screen → being redirected back → the YouTube channel appearing in LYRA → (if possible) scheduling a YouTube post and it appearing on the channel.

> Use a test Google account with a test Google Business Profile location and a test YouTube channel. Do not use real customer data.

### Verification timeline

Google's review typically takes **4–7 business days** for initial review. They may ask follow-up questions — respond within 48 hours. The process can take up to 2 weeks total with back-and-forth.

---

## Step 6: Add Environment Variables to Netlify

Once credentials are created (Step 4), add them to Netlify:

Go to **Netlify → your site → Site configuration → Environment variables** and add:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | The Client ID from Step 4 |
| `GOOGLE_CLIENT_SECRET` | The Client Secret from Step 4 |

Trigger a Netlify redeploy after adding them.

---

## Step 7: Testing Before Verification is Complete

While verification is pending, the app works for test users (accounts added in Step 3). Use this time to:

1. Test the Google Business Profile connection end-to-end with your own Google account.
2. Test the YouTube connection end-to-end.
3. Confirm Business Profile locations appear in LYRA settings after connecting.
4. Confirm the YouTube channel appears in LYRA settings after connecting.

If Google shows a warning screen ("This app is not verified") when connecting, click **Advanced → Go to LYRA (unsafe)**. This warning disappears once verification is complete.

---

## After Verification

Once Google approves the verification:
1. The "not verified" warning disappears for all users.
2. Any Google account holder can connect their Business Profile or YouTube channel.
3. Test that a Google account with **no test user role** can now complete the connection successfully.

---

## Checklist Summary

- [ ] Google Cloud project created and named LYRA
- [ ] Google Business Profile API enabled
- [ ] YouTube Data API v3 enabled
- [ ] OAuth consent screen configured (External, all fields complete, privacy + terms pages live)
- [ ] All 5 scopes added to consent screen
- [ ] Test users added (including richunwin3524@gmail.com)
- [ ] OAuth client ID created with both redirect URIs (google + youtube, prod + local)
- [ ] Client ID and Secret added to Netlify env vars
- [ ] Netlify redeployed
- [ ] Google Business connection tested with test account ✅
- [ ] YouTube connection tested with test account ✅
- [ ] Screencasts recorded for business.manage and youtube.upload
- [ ] App published and verification form submitted
- [ ] Monitoring Google's email for reviewer questions (respond within 48 hours)
- [ ] Post-verification: tested with a non-test-user Google account
