# LinkedIn Community Management API — Application Guide for LYRA

> **Purpose:** Step-by-step instructions for applying for the LinkedIn Community Management API, which is required before LYRA can post to and manage LinkedIn Company Pages on behalf of customers.
>
> **Who completes this:** Richard Unwin (business owner / LinkedIn page admin). Start this immediately — the review takes 1–4 weeks.
>
> **Time required:** 1–2 hours to complete the application. The review itself takes 1–4 weeks.

---

## Why This Is Necessary

LinkedIn's API restricts which permissions apps can request. Posting to a LinkedIn Company Page requires the `w_organization_social` and `rw_organization_admin` scopes. These scopes are part of the **Community Management API** product, which requires manual review and approval by LinkedIn.

Without this approval:
- LYRA can connect a user's personal LinkedIn profile (the `w_member_social` scope, already implemented)
- LYRA **cannot** publish posts to LinkedIn Company Pages
- LYRA **cannot** read comments on or manage Company Pages

This is a process step, not a technical one. The code is ready to enable these scopes the moment LinkedIn approves the application.

---

## Step 1: Create the LinkedIn Developer Application

If LYRA does not already have a LinkedIn app, create one now. If one exists, skip to Step 2.

1. Go to [linkedin.com/developers](https://www.linkedin.com/developers) and log in with the LYRA LinkedIn account.
2. Click **Create App**.
3. Fill in:
   - **App Name:** LYRA
   - **LinkedIn Page:** Select the LYRA Company Page (you must be a Super Admin of this Page)
   - **App Logo:** Upload the LYRA logo (square format, min 100×100px)
   - **Legal Agreement:** Accept
4. Click **Create App**.

---

## Step 2: Verify the App with the LYRA LinkedIn Page

LinkedIn requires a Page Super Admin to verify the app before you can request additional products.

1. In your new app's dashboard, go to the **Settings** tab.
2. Find the **Verify** section.
3. Click **Verify** — this sends a verification request to the LYRA LinkedIn Company Page.
4. In LinkedIn, go to your LYRA Company Page → **Admin Tools → Partner Applications**.
5. Find the LYRA developer app and click **Verify**.
6. Return to the developer dashboard — the app should now show as **Verified**.

> If you cannot see Partner Applications on the Page, confirm you have Super Admin access. Go to Page → Admin Tools → Manage Admins to check.

---

## Step 3: Add the Required Products

LinkedIn grants API access via discrete "Products" you add to your app. LYRA needs three.

### 3.1 Sign In with LinkedIn using OpenID Connect (already available)

This product is typically auto-approved and covers the `openid`, `profile`, and `email` scopes. It is already implemented in LYRA.

1. In your app dashboard → **Products** tab.
2. Find **Sign In with LinkedIn using OpenID Connect**.
3. Click **Request Access** if not already added. It usually approves instantly.

### 3.2 Share on LinkedIn

This product covers the `w_member_social` scope, which allows LYRA to post to a user's personal LinkedIn feed. It is already implemented in LYRA's code.

1. In **Products**, find **Share on LinkedIn**.
2. Click **Request Access**.
3. This typically approves within a few hours to a day. No manual review required.

### 3.3 Community Management API (the key one)

This is the product that unlocks Company Page posting and management.

1. In **Products**, find **Community Management API**.
2. Click **Request Access**.
3. You will be presented with an application form. Complete it carefully — this section is critical.

---

## Step 4: Complete the Community Management API Application Form

This is the application LinkedIn reviewers will read. Write clearly and specifically.

### Application text — copy, adapt, and paste

**Use case description:**

> LYRA is a social media management SaaS platform for marketing agencies, freelancers, and small businesses in Australia and globally. Our customers manage social media presence for their clients across multiple platforms including LinkedIn.
>
> LYRA uses the Community Management API to:
>
> 1. **Publish posts to LinkedIn Company Pages** on behalf of users who are page administrators. Our customers schedule content in advance using LYRA's content calendar, and LYRA publishes it at the scheduled time using `w_organization_social`.
>
> 2. **Read posts and engagement from Company Pages** to populate LYRA's analytics dashboard and comment inbox, using `r_organization_social`.
>
> 3. **Manage page access and settings** for pages the authenticated user administers, using `rw_organization_admin`. This allows LYRA to list which pages a user manages during the onboarding flow.
>
> LYRA's OAuth flow uses the standard LinkedIn OAuth 2.0 authorization code flow. Users log in with their LinkedIn account, approve the requested scopes on the LinkedIn consent screen, and LYRA stores an access token (encrypted at rest) to publish and read on their behalf. Users can revoke access at any time from LinkedIn's Permitted Services settings.
>
> All publishing is done by authenticated users who are Page administrators — LYRA does not create synthetic content or automate engagement without the explicit instruction of the account owner.

---

## Step 5: Scopes to Request

When the Community Management API application is approved, these scopes become available:

| Scope | Purpose | When to add to code |
|---|---|---|
| `r_organization_social` | Read posts, comments, and engagement from Company Pages | Add after approval |
| `w_organization_social` | Publish posts to Company Pages | Add after approval |
| `rw_organization_admin` | List and manage pages the user administers | Add after approval |

The developer will add these to the `SCOPES` array in `services/social/linkedin.ts` once approval is confirmed.

> **Note:** Do not attempt to add these scopes to the code before approval. LinkedIn will return an "invalid scope" error at the OAuth authorization step if you request unapproved scopes.

---

## Step 6: Prepare a Demo of the OAuth Flow

LinkedIn's application asks for a screencast of the OAuth flow. Record a short video (under 3 minutes) showing:

1. A user clicking "Connect LinkedIn" in LYRA's workspace settings
2. Being redirected to LinkedIn's authorization page
3. The LinkedIn consent screen showing the requested scopes
4. The user approving access
5. Being redirected back to LYRA
6. The LinkedIn account appearing as connected in LYRA's settings

> You can record this with just the existing `openid`, `profile`, `email`, and `w_member_social` scopes visible on the consent screen. You are demonstrating the flow pattern, not the org scopes specifically.

---

## Step 7: Submit and Monitor

1. Submit the Community Management API application.
2. LinkedIn will send an email confirmation.
3. Review typically takes **1–4 weeks**. Check your email regularly.
4. If LinkedIn asks follow-up questions, respond within 24 hours.
5. If approved, notify the development team immediately so the scopes can be added to the code and tested.

---

## Step 8: After Approval — What the Developer Does

Once LinkedIn confirms approval, the developer makes one change to `services/social/linkedin.ts`:

```typescript
const SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
  // These three are activated after LinkedIn Community Management API approval:
  'r_organization_social',
  'w_organization_social',
  'rw_organization_admin',
].join(' ')
```

After this change is deployed, the LinkedIn connection flow will prompt users to grant Company Page access, and `getOrganizations()` will return their pages correctly.

---

## Important Notes

- **Cost:** The Community Management API for legitimate SaaS tools publishing on behalf of their users is available without a paid LinkedIn partnership. Confirm this on the application confirmation — if LinkedIn requests payment, escalate before proceeding.
- **Refresh tokens:** LinkedIn access tokens expire in 60 days. LinkedIn issues refresh tokens that last 365 days. The developer will implement a token-refresh job to renew tokens before they expire and prevent silent posting failures.
- **Rate limits:** LinkedIn's API has rate limits. The developer is aware and LYRA's posting queue handles this appropriately.
- **Personal posting:** The `w_member_social` scope (personal feed posting) is already live in LYRA's code and does not require Community Management API approval.

---

## Checklist Summary

- [ ] LinkedIn developer app created at linkedin.com/developers
- [ ] App verified with the LYRA LinkedIn Company Page
- [ ] "Sign In with LinkedIn using OpenID Connect" product added
- [ ] "Share on LinkedIn" product added and approved
- [ ] "Community Management API" application submitted with use-case text
- [ ] OAuth flow screencast recorded and attached to application
- [ ] Monitoring email for approval (respond to follow-ups within 24 hours)
- [ ] On approval: notify development team to add org scopes to linkedin.ts
- [ ] Post-approval: test Company Page connection with a non-admin test account
