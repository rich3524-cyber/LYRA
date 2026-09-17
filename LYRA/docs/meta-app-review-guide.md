# Meta App Review — Submission Guide for LYRA

> **Purpose:** Step-by-step instructions for completing Meta Business Verification and submitting LYRA for App Review so that Page-management permissions are granted to all customers (not just app developers).
>
> **Who completes this:** Richard Unwin (business owner). The developer portions are already complete — the code requests the correct scopes and has demonstrable features built.
>
> **Time required:** Allow 2–4 hours to complete all steps. The review itself takes 2–6 weeks after submission.

---

## Why This Is Necessary

LYRA's Meta app is currently in Development Mode. In Development Mode, Meta only grants Page-management permissions to users who have a role on the app (Admin, Developer, or Tester). Every other customer — every real paying user — can only connect their personal profile, not their business Pages.

Completing App Review moves the app to Live Mode. Once Live, Meta grants Page permissions to any user who approves the consent screen. This is the single change that fixes the "can't see my Pages" problem permanently.

---

## Step 1: Prepare the Meta App Dashboard

### 1.1 Log into Meta for Developers

Go to [developers.facebook.com](https://developers.facebook.com) and log in as the LYRA app admin.

### 1.2 Confirm your app is the correct type

1. In the App Dashboard, go to **App Settings → Basic**.
2. Confirm **App Type** is set to **Business**.
   - If it shows "Consumer" or another type, you may need to create a new app of type "Business" and migrate settings. Contact Meta support if needed.

### 1.3 Add Facebook Login for Business

1. In the left sidebar, click **Add Product**.
2. Find **Facebook Login for Business** and click **Set Up**.
3. This replaces the standard Facebook Login. It allows you to create saved configurations specifying exactly which asset types and permissions your app needs.

---

## Step 2: Complete Meta Business Verification

This is mandatory before App Review. Meta must verify that LYRA is a real business.

1. Go to **App Settings → Basic** → scroll to the **Business** section.
2. Click **Create Business Account** (if not already linked) or link your existing Business Manager account.
3. In your **Meta Business Manager**, go to **Business Settings → Security Centre**.
4. Click **Start Verification**.
5. You will need to provide:
   - Business name (LYRA / Into The Wild Marketing)
   - Business address (Australian address)
   - ABN — have this ready
   - Business phone number
   - Business website: **lyraonline.ai**
6. Meta may ask you to verify by phone call, SMS, or by uploading a business document (bank statement, utility bill, or government registration showing business name + address).
7. Complete verification. This typically takes 1–5 business days.

> **Do not proceed to Step 3 until Business Verification shows "Verified" in Business Settings.**

---

## Step 3: Create a Facebook Login for Business Configuration

Once your app type is Business and Facebook Login for Business is added:

1. In the App Dashboard sidebar, click **Facebook Login for Business → Configurations**.
2. Click **Create Configuration**.
3. Name it something like **"LYRA Standard Connection"**.
4. Under **Permissions**, add all of the following:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_manage_engagement`
   - `pages_manage_metadata`
   - `pages_read_user_content`
   - `business_management`
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_comments`
   - `ads_management`
5. Under **Asset Types**, select:
   - **Pages** (so users are prompted to share their Pages)
   - **Instagram accounts** (linked to Pages)
6. Save the configuration. Note the **Configuration ID** — you will need to pass this to the developer (Rich to pass to dev team).
7. The developer will add this Configuration ID to the `getAuthUrl` function in `services/social/facebook.ts`.

---

## Step 4: Request Advanced Access for Each Permission

This is the core of App Review. For each permission, you must justify its use and record a screencast demonstrating it.

Navigate to: **App Dashboard → App Review → Permissions and Features**

For each permission below, click **Request Advanced Access** and complete the form:

---

### `pages_show_list`

**Why LYRA needs it:** This permission returns the list of Pages a user manages. Without it, `GET /me/accounts` returns an empty list and no Pages can be connected. It is the foundational permission for the entire product.

**How to demonstrate:** Record a screencast showing:
1. A user clicking "Connect" on the Facebook & Instagram card in LYRA's workspace settings
2. The pre-connect warning modal appearing (LYRA UI)
3. The Facebook consent screen listing Pages
4. After approval, the Page-picker screen in LYRA listing all managed Pages
5. The user selecting a Page and clicking "Connect Pages"
6. The connected Page appearing in the LYRA settings screen with a green status indicator

---

### `pages_manage_posts`

**Why LYRA needs it:** LYRA schedules and publishes posts to Facebook Pages on behalf of users. This permission is required to create posts via the Graph API.

**How to demonstrate:** Record a screencast showing:
1. A user opening the LYRA Compose screen
2. Writing a post caption (with or without AI generation)
3. Selecting a connected Facebook Page as the publishing destination
4. Setting a schedule date and clicking "Schedule"
5. The post appearing on the Content Calendar
6. At the scheduled time, the post appearing on the actual Facebook Page

---

### `pages_read_engagement`

**Why LYRA needs it:** LYRA reads comment and reaction data from Page posts to populate the Inbox for AI response drafting. This permission grants read access to the Page's engagement data.

**How to demonstrate:** Record a screencast showing:
1. A post with comments on a connected Facebook Page
2. Opening LYRA's Inbox
3. The comment appearing in the Inbox with the commenter's name and message
4. The AI-generated response draft

---

### `pages_manage_engagement`

**Why LYRA needs it:** This permission is required to post replies to comments on a Facebook Page. LYRA's core differentiator is AI-drafted and AI-auto-sent comment responses. Posting a reply requires this permission.

**How to demonstrate:** Record a screencast showing:
1. A comment in the LYRA Inbox with an AI-drafted response
2. The user clicking "Send Response" (or the AI auto-sending in full-autonomy mode)
3. The response appearing as a reply under the original comment on the Facebook Page

---

### `pages_manage_metadata`

**Why LYRA needs it:** Required to configure and manage webhooks that notify LYRA in real time when new comments arrive on a Page. Without this, LYRA must poll for comments on a fixed schedule, which creates delays. Real-time webhooks are what enable the "24/7 autonomous response" feature.

**How to demonstrate:** Record a screencast or describe in the form that LYRA uses the Page Webhooks API to subscribe to `feed` events (new comments) on connected Pages, and that `pages_manage_metadata` is required to call the webhook subscription endpoint.

---

### `pages_read_user_content`

**Why LYRA needs it:** This permission grants read access to user-generated content posted on the Page — specifically comments, reviews, and visitor posts. It is the complement to `pages_read_engagement` that specifically covers content created by Page visitors rather than the Page itself.

**How to demonstrate:** Record a screencast showing the LYRA Inbox listing a visitor comment (not a reply by the Page) and the AI-generated response draft for it.

---

### `business_management`

**Why LYRA needs it:** LYRA serves marketing agencies who manage multiple client Pages via Meta Business Manager. This permission allows LYRA to list the ad accounts and business assets associated with a Business Manager that the user has access to. It is also required for the boost/ads functionality.

**How to demonstrate:** Record a screencast showing:
1. A user who is a Business Manager admin connecting their account
2. LYRA listing Pages accessible via the Business Manager (not just personal Pages)

---

### `instagram_basic`

**Why LYRA needs it:** This permission links a Facebook Page's connected Instagram Business or Creator account to LYRA. It is the entry point for all Instagram functionality — without it, no Instagram account can be connected.

**How to demonstrate:** Record a screencast showing:
1. After connecting a Facebook Page, LYRA automatically detecting the linked Instagram account
2. The Instagram account appearing as a connected account in LYRA's settings

---

### `instagram_content_publish`

**Why LYRA needs it:** This permission is required to publish posts (images, videos, and carousels) to an Instagram Business or Creator account via the Content Publishing API.

**How to demonstrate:** Record a screencast showing:
1. A user scheduling an Instagram post in the LYRA Compose screen
2. The post appearing on the Instagram account at the scheduled time

---

### `instagram_manage_comments`

**Why LYRA needs it:** This permission grants read and write access to comments on Instagram media objects. LYRA reads comments to show them in the Inbox and writes reply comments in response — mirroring the same AI-response workflow as Facebook.

**How to demonstrate:** Record a screencast showing an Instagram comment in the LYRA Inbox with an AI-drafted reply, and the reply appearing on the Instagram post after sending.

---

### `ads_management`

**Why LYRA needs it:** LYRA allows users to boost published posts by creating Meta ad campaigns directly from the platform. This permission is required to read ad account information and create boost campaigns.

**How to demonstrate:** Record a screencast showing:
1. A published post in the LYRA calendar
2. The user clicking "Boost" on the post
3. A boost configuration screen (budget, duration)
4. The boost being created

---

## Step 5: Screencast Requirements

Meta has strict requirements for review screencasts:

- **Format:** MP4 or MOV, under 50MB per video, at least 720p resolution
- **Audio:** Not required, but captions or on-screen text explaining each step help
- **Must show:** The full user journey from your app's UI through the Facebook permission consent screen and back
- **Must not show:** Real customer data, real production tokens, real financial data
- **Use a test account:** Create a Facebook test user in the Meta App Dashboard (Roles → Test Users) with a test Page. Demonstrate all flows with this test account, not a real customer account.

### Creating a test Page for screencasts

1. In the Meta App Dashboard → Roles → Test Users, create a Test User.
2. Log in as that test user on a separate browser profile.
3. Create a Facebook Page on that test account (e.g. "LYRA Demo Page").
4. Add some dummy comments to posts on that Page.
5. Use this account for all screencasts.

---

## Step 6: Submit the Review

Once all screencasts are recorded and all permission requests have been filled out:

1. In **App Review → Permissions and Features**, confirm each permission shows **"Requested Advanced Access"**
2. Click **Submit for Review**
3. Fill in the **Notes to Reviewer** field. Suggested text:

> LYRA is a social media management SaaS platform for marketing agencies, freelancers, and businesses. It allows users to schedule posts, generate AI captions, and respond to comments and reviews on behalf of their clients — 24/7, with configurable autonomy levels.
>
> All requested permissions are used for features that are live in the application: post scheduling, comment inbox, AI response drafting and sending, Instagram content publishing, and ad boost creation. Screencasts demonstrating each permission are attached.
>
> LYRA serves agency customers managing multiple client Pages, which is why business_management is required in addition to the standard Page permissions.

4. Submit.

---

## Step 7: Respond to Reviewer Feedback Quickly

Meta reviewers often come back with follow-up questions or requests for additional screencasts. Check your email daily after submission. A prompt response (within 24 hours) speeds up the approval cycle significantly. Budget 2–6 weeks total, including any back-and-forth.

---

## After Approval

Once all permissions show **"Advanced Access: Approved"**:

1. Notify the development team — no code changes are needed, but testing with a non-developer account should be performed to confirm Pages appear correctly.
2. Test with a Facebook account that has **no role** on the LYRA app. Connect their account and confirm their Pages appear.
3. Update any internal support documentation to reflect the approved flow.

---

## Checklist Summary

- [ ] Meta Business Verification completed and showing "Verified"
- [ ] App type confirmed as "Business"
- [ ] Facebook Login for Business product added
- [ ] Login for Business Configuration created with all 11 permissions + Page/Instagram asset types
- [ ] Configuration ID shared with developer team
- [ ] Test Facebook account and Page created for screencasts
- [ ] Screencasts recorded for all 11 permissions
- [ ] Advanced Access requested for all 11 permissions with justification text
- [ ] App Review submitted with Notes to Reviewer
- [ ] Monitoring email for reviewer responses (respond within 24 hours)
- [ ] Post-approval: tested with a non-developer account
