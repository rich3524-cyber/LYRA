# Post Boosting Design

**Date:** 2026-05-20  
**Status:** Approved for implementation

---

## Goal

Allow Pro and Agency users to boost published Facebook and Instagram posts directly from LYRA's Post Detail Panel, using Meta's Marketing API. Users configure budget, duration, and audience with preset chips — no full ad manager required. Boost status is tracked in the database and surfaced back in the detail panel.

---

## Scope

**In scope:**
- Facebook and Instagram only (both via Meta Marketing API)
- Pro and Agency plan tiers only (Starter sees nothing)
- Boost entry point: Post Detail Panel (published posts only)
- Config: budget presets ($10 / $25 / $50 / $100), duration presets (3 / 7 / 14 / 30 days), audience presets (Page followers / Followers + similar / Broad reach)
- Three panel states: no boost, active boost (with live stats), ended/cancelled boost
- Cancel boost functionality
- Boost again after a boost ends

**Out of scope:**
- Google Ads (future)
- LinkedIn boosting (future)
- Custom audience builder (future)
- Budget editing after boost starts
- Multiple simultaneous boosts per post
- Boost history (only the most recent boost is stored per post — "Boost again" replaces the previous record)

---

## Architecture

### New files

**`lyra/services/social/meta-ads.ts`**  
The only file that calls Meta's Marketing API. Three exported functions:

- `createBoost({ pageId, platformPostId, adAccountId, accessToken, budget, durationDays, audience })` — creates Campaign → AdSet → Ad in sequence, returns `{ adCampaignId, adSetId, adId }`
- `cancelBoost({ adCampaignId, accessToken })` — pauses the campaign on Meta
- `getBoostReach({ adCampaignId, accessToken })` — fetches impressions from the campaign insights endpoint (used to show "Reached" count in the active state)

Campaign objective: `POST_ENGAGEMENT`. Budget passed as `lifetime_budget` in cents. End time calculated from `durationDays`.

Audience targeting mappings:
- `followers` → `{ connections: [pageId] }`
- `followers_lookalike` → `{ connections: [pageId], interests: [] }` (Meta optimises delivery to similar users)
- `broad` → `{ geo_locations: { countries: ['AU'] } }` (country defaults to AU; can be made configurable later)

**`lyra/app/api/posts/[id]/boost/route.ts`**  
Two handlers:
- `POST` — validate user plan (reject if STARTER), fetch post + SocialAccount, call `createBoost()`, upsert `PostBoost` record (delete existing ended/cancelled record first if present), return the new boost
- `DELETE` — call `cancelBoost()`, update `PostBoost.status` to CANCELLED

---

### Modified files

**`lyra/prisma/schema.prisma`**  
New model:

```prisma
model PostBoost {
  id            String      @id @default(cuid())
  postId        String      @unique
  post          Post        @relation(fields: [postId], references: [id], onDelete: Cascade)
  platform      Platform
  adCampaignId  String
  adSetId       String
  adId          String
  budget        Int         // total budget in cents (e.g. 2500 = $25)
  durationDays  Int
  audience      String      // "followers" | "followers_lookalike" | "broad"
  status        BoostStatus @default(ACTIVE)
  startedAt     DateTime    @default(now())
  endsAt        DateTime
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}

enum BoostStatus {
  ACTIVE
  ENDED
  CANCELLED
  FAILED
}
```

New field on `Post`:
```prisma
boost   PostBoost?
```

New field on `SocialAccount`:
```prisma
adAccountId  String?   // Meta Ad Account ID — fetched at OAuth time
```

**`lyra/services/social/facebook.ts`**  
Add `ads_management` to `SCOPES`. Add `fetchAdAccountId(accessToken)` — calls `GET /me/adaccounts` and returns the first active ad account ID.

**`lyra/app/api/social/callback/[platform]/route.ts`**  
For Facebook callback: after storing the access token, call `fetchAdAccountId()` and store the result in `SocialAccount.adAccountId`. If no ad account exists, store `null` — the boost panel will show a setup message.

**`lyra/app/api/posts/route.ts`** (GET)  
Include `boost` relation in the post query so boost status is available to the calendar and detail panel without a separate fetch.

**`lyra/components/lyra/calendar/post-detail-panel.tsx`**  
Add boost section below the existing post content, visible only when:
- `post.status === 'PUBLISHED'`
- `post.platform === 'FACEBOOK' || post.platform === 'INSTAGRAM'`
- User plan is PRO or AGENCY (passed as prop from the page)

Three states rendered:
1. **No boost** — budget chips, duration chips, audience chips, "Boost for $X · Y days" CTA button
2. **Active boost** — "Boost active" header, Live badge, three stat tiles (Budget / Days left / Reached), audience + end date line, "Cancel boost" button
3. **Ended/Cancelled** — "Previous boost" header, Ended badge, three stat tiles (Spent / Days ran / Reached), "Boost again" CTA

If `SocialAccount.adAccountId` is null: show "Connect a Facebook Ad Account to enable boosting" with a link to the Facebook Business Manager.

---

## Data Flow

```
User clicks "Boost for $25 · 7 days"
  → POST /api/posts/[id]/boost
  → Validate plan (Pro/Agency)
  → Fetch Post (must be PUBLISHED, must have platformPostId)
  → Fetch SocialAccount (get adAccountId + decrypt accessToken)
  → meta-ads.ts: createBoost() → Campaign → AdSet → Ad
  → Save PostBoost { adCampaignId, adSetId, adId, budget: 2500, durationDays: 7, endsAt, status: ACTIVE }
  → Return PostBoost to client
  → Panel switches to State 2 (Active boost)

User clicks "Cancel boost"
  → DELETE /api/posts/[id]/boost
  → meta-ads.ts: cancelBoost() → pause campaign on Meta
  → Update PostBoost.status = CANCELLED
  → Panel switches to State 3 (Ended/Cancelled)
```

---

## Plan Gating

| Tier | Boost available |
|---|---|
| Starter | No — boost section hidden entirely |
| Pro | Yes |
| Agency | Yes |

The workspace `plan` field is read server-side in the API route (rejects with 403 if STARTER) and client-side in the detail panel (hides the section). Both guards are required.

---

## Error Handling

- Meta API rejects the boost (e.g. post not eligible, ad account suspended) → return error message to client, shown inline in the boost panel. Do not save a PostBoost record.
- `adAccountId` is null → show setup message, no API call attempted.
- Cancel fails on Meta → return error, leave PostBoost.status as ACTIVE, show error toast.
- Post has no `platformPostId` (wasn't published via LYRA, or publish failed) → boost section hidden.

---

## Meta App Review Requirement

`ads_management` scope requires Meta app review before non-admin users can use it in production. During development, the app owner (admin) can test immediately. App review should be submitted alongside the existing Facebook page permissions review.

---

## Schema Changes Required

Run in Command Prompt after implementation:

```cmd
set "DATABASE_URL=postgresql://postgres.votuufwukkhojunzrjoa:PASSWORD@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
set "DIRECT_URL=postgresql://postgres.votuufwukkhojunzrjoa:PASSWORD@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
cd "C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra"
npx prisma db push
```

Or via Supabase SQL Editor (preferred after today's experience):

```sql
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "boostId" TEXT UNIQUE;

CREATE TYPE "BoostStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED', 'FAILED');

CREATE TABLE IF NOT EXISTS "PostBoost" (
  "id"           TEXT PRIMARY KEY,
  "postId"       TEXT UNIQUE NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE,
  "platform"     TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "adSetId"      TEXT NOT NULL,
  "adId"         TEXT NOT NULL,
  "budget"       INTEGER NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "audience"     TEXT NOT NULL,
  "status"       "BoostStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt"       TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);

ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "adAccountId" TEXT;
```
