# Post Boosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Pro and Agency users to boost published Facebook and Instagram posts directly from the Post Detail Panel using Meta's Marketing API, with budget/duration/audience presets and live boost status tracking.

**Architecture:** Six sequential tasks — schema first, then service layer, then API routes, then UI. Each task produces working, independently testable code. Schema is applied via Supabase SQL Editor (not prisma db push) due to connection constraints.

**Tech Stack:** Next.js 15 App Router, Prisma, PostgreSQL (Supabase), Meta Marketing API v19.0, TypeScript, shadcn/ui, Tailwind CSS, Framer Motion, Lucide React.

---

### Task 1: Database Schema Changes

**Files:**
- Modify: `lyra/prisma/schema.prisma`
- Apply via: Supabase SQL Editor (not CLI — see step below)

**Context:**  
The schema needs three additions: a new `PostBoost` model, a new `BoostStatus` enum, a new `adAccountId` field on `SocialAccount`, and a `boost` relation on `Post`. These must be applied via the Supabase SQL Editor because `prisma db push` has connection issues on this machine.

- [ ] **Step 1: Add BoostStatus enum and PostBoost model to schema.prisma**

Open `lyra/prisma/schema.prisma`. Add the following after the `PostMetrics` model:

```prisma
model PostBoost {
  id            String      @id @default(cuid())
  postId        String      @unique
  post          Post        @relation(fields: [postId], references: [id], onDelete: Cascade)
  platform      Platform
  adCampaignId  String
  adSetId       String
  adId          String
  budget        Int
  durationDays  Int
  audience      String
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

- [ ] **Step 2: Add adAccountId to SocialAccount model**

In `schema.prisma`, find the `SocialAccount` model. Add `adAccountId` after `lastCommentSyncAt`:

```prisma
  lastCommentSyncAt   DateTime?
  adAccountId         String?
```

- [ ] **Step 3: Add boost relation to Post model**

In `schema.prisma`, find the `Post` model. Add `boost` after the `comments` relation:

```prisma
  approval PostApproval?
  metrics  PostMetrics?
  comments Comment[]
  boost    PostBoost?
```

- [ ] **Step 4: Apply schema to database via Supabase SQL Editor**

Open the Supabase SQL Editor for the LYRA project. Run:

```sql
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

- [ ] **Step 5: Regenerate Prisma client**

```bash
cd "C:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra"
npx prisma generate
```

Expected output: `✔ Generated Prisma Client`

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lyra/prisma/schema.prisma
git commit -m "feat: add PostBoost model, BoostStatus enum, adAccountId to SocialAccount"
```

---

### Task 2: Meta Ads Service

**Files:**
- Create: `lyra/services/social/meta-ads.ts`

**Context:**  
This is the only file in the codebase that calls Meta's Marketing API. It must create the Campaign → AdSet → Ad sequence, cancel a campaign, and fetch reach impressions. The Meta Marketing API base URL is `https://graph.facebook.com/v19.0`. Budget is passed as `lifetime_budget` in cents. Campaign objective is `POST_ENGAGEMENT`.

- [ ] **Step 1: Create the service file**

Create `lyra/services/social/meta-ads.ts`:

```typescript
const BASE = 'https://graph.facebook.com/v19.0'

export interface BoostResult {
  adCampaignId: string
  adSetId: string
  adId: string
}

export interface CreateBoostParams {
  pageId: string
  platformPostId: string
  adAccountId: string
  accessToken: string
  budget: number       // total budget in cents (e.g. 2500 = $25)
  durationDays: number
  audience: 'followers' | 'followers_lookalike' | 'broad'
}

export interface CancelBoostParams {
  adCampaignId: string
  accessToken: string
}

export interface GetBoostReachParams {
  adCampaignId: string
  accessToken: string
}

function audienceSpec(pageId: string, audience: CreateBoostParams['audience']) {
  switch (audience) {
    case 'followers':
      return { connections: [pageId] }
    case 'followers_lookalike':
      return { connections: [pageId], interests: [] }
    case 'broad':
      return { geo_locations: { countries: ['AU'] } }
  }
}

async function metaPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if (data.error) {
    const err = data.error as { message: string }
    throw new Error(err.message)
  }
  return data
}

export async function createBoost(params: CreateBoostParams): Promise<BoostResult> {
  const { pageId, platformPostId, adAccountId, accessToken, budget, durationDays, audience } = params
  const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

  // Step 1: Create Campaign
  const campaign = await metaPost(`/act_${adAccountId}/campaigns`, {
    name: `LYRA Boost — ${platformPostId}`,
    objective: 'POST_ENGAGEMENT',
    status: 'ACTIVE',
    access_token: accessToken,
  })
  const adCampaignId = campaign.id as string

  // Step 2: Create AdSet
  const adSet = await metaPost(`/act_${adAccountId}/adsets`, {
    name: `LYRA AdSet — ${platformPostId}`,
    campaign_id: adCampaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'POST_ENGAGEMENT',
    lifetime_budget: budget,
    end_time: Math.floor(endsAt.getTime() / 1000),
    targeting: audienceSpec(pageId, audience),
    status: 'ACTIVE',
    access_token: accessToken,
  })
  const adSetId = adSet.id as string

  // Step 3: Create Ad
  const creative = await metaPost(`/act_${adAccountId}/adcreatives`, {
    name: `LYRA Creative — ${platformPostId}`,
    object_story_id: `${pageId}_${platformPostId}`,
    access_token: accessToken,
  })
  const creativeId = creative.id as string

  const ad = await metaPost(`/act_${adAccountId}/ads`, {
    name: `LYRA Ad — ${platformPostId}`,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: 'ACTIVE',
    access_token: accessToken,
  })
  const adId = ad.id as string

  return { adCampaignId, adSetId, adId }
}

export async function cancelBoost(params: CancelBoostParams): Promise<void> {
  await metaPost(`/${params.adCampaignId}`, {
    status: 'PAUSED',
    access_token: params.accessToken,
  })
}

export async function getBoostReach(params: GetBoostReachParams): Promise<number> {
  const res = await fetch(
    `${BASE}/${params.adCampaignId}/insights?fields=impressions&access_token=${params.accessToken}`
  )
  const data = await res.json() as { data?: { impressions?: string }[] }
  const impressions = data.data?.[0]?.impressions
  return impressions ? parseInt(impressions, 10) : 0
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lyra/services/social/meta-ads.ts
git commit -m "feat: add meta-ads service (createBoost, cancelBoost, getBoostReach)"
```

---

### Task 3: Facebook Service — Ad Account Support

**Files:**
- Modify: `lyra/services/social/facebook.ts`

**Context:**  
The existing `facebook.ts` has `SCOPES`, `getAuthUrl`, `exchangeCode`, `getLongLivedToken`, and `getPages`. We need to add `ads_management` to SCOPES and add `fetchAdAccountId` which calls `GET /me/adaccounts` and returns the first active ad account ID (or null if none).

- [ ] **Step 1: Add ads_management to SCOPES**

In `lyra/services/social/facebook.ts`, change:

```typescript
const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
].join(',')
```

To:

```typescript
const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'ads_management',
].join(',')
```

- [ ] **Step 2: Add fetchAdAccountId function**

At the end of `lyra/services/social/facebook.ts`, add:

```typescript
export async function fetchAdAccountId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    `${BASE_URL}/me/adaccounts?fields=id,account_status&access_token=${accessToken}`
  )
  const data = await res.json() as { data?: { id: string; account_status: number }[]; error?: { message: string } }
  if (data.error) return null
  // account_status 1 = ACTIVE
  const active = (data.data ?? []).find((a) => a.account_status === 1)
  return active ? active.id.replace('act_', '') : null
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lyra/services/social/facebook.ts
git commit -m "feat: add ads_management scope and fetchAdAccountId to facebook service"
```

---

### Task 4: Facebook OAuth Callback — Store Ad Account ID

**Files:**
- Modify: `lyra/app/api/social/callback/[platform]/route.ts`

**Context:**  
The existing Facebook callback in this file upserts each page into `SocialAccount`. After storing the access token, we now need to also call `fetchAdAccountId(longToken)` (using the user-level long-lived token, not the page token) and store the result in `SocialAccount.adAccountId`. The `adAccountId` field is `String?` so null is valid — it means the user has no ad account configured.

Note: We call `fetchAdAccountId` once per Facebook connection (using the long-lived user token), then store the same `adAccountId` on each page's `SocialAccount` record. This is correct because the ad account is tied to the user, not the individual page.

- [ ] **Step 1: Import fetchAdAccountId**

In `lyra/app/api/social/callback/[platform]/route.ts`, the Facebook import is already:

```typescript
import * as facebook from '@/services/social/facebook'
```

No import change needed — `fetchAdAccountId` is exported from the same module.

- [ ] **Step 2: Fetch adAccountId and store on upsert**

In the `case 'facebook':` block, after `const pages = await facebook.getPages(longToken)`, add the ad account fetch. Then include `adAccountId` in both `create` and `update` of the upsert.

Replace the entire `case 'facebook':` block with:

```typescript
case 'facebook': {
  const shortToken = await facebook.exchangeCode(code)
  const longToken = await facebook.getLongLivedToken(shortToken)
  const pages = await facebook.getPages(longToken)
  const adAccountId = await facebook.fetchAdAccountId(longToken)

  for (const page of pages) {
    await prisma.socialAccount.upsert({
      where: { workspaceId_platform_platformId: { workspaceId, platform: 'FACEBOOK', platformId: page.id } },
      create: {
        workspaceId,
        platform: 'FACEBOOK',
        platformId: page.id,
        handle: page.name,
        name: page.name,
        avatarUrl: page.avatarUrl,
        accessToken: encrypt(page.accessToken),
        adAccountId,
      },
      update: {
        accessToken: encrypt(page.accessToken),
        adAccountId,
        isActive: true,
      },
    })

    // Also connect any linked Instagram Business Account
    try {
      const igAccount = await instagram.getConnectedAccount(page.id, page.accessToken)
      if (igAccount) {
        await prisma.socialAccount.upsert({
          where: { workspaceId_platform_platformId: { workspaceId, platform: 'INSTAGRAM', platformId: igAccount.id } },
          create: {
            workspaceId,
            platform: 'INSTAGRAM',
            platformId: igAccount.id,
            handle: igAccount.username,
            name: igAccount.name,
            avatarUrl: igAccount.avatarUrl,
            accessToken: encrypt(page.accessToken),
            adAccountId,
          },
          update: {
            accessToken: encrypt(page.accessToken),
            adAccountId,
            isActive: true,
          },
        })
      }
    } catch {
      // IG account not connected to this page — skip silently
    }
  }
  break
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "lyra/app/api/social/callback/[platform]/route.ts"
git commit -m "feat: store adAccountId on SocialAccount during Facebook OAuth callback"
```

---

### Task 5: Boost API Route

**Files:**
- Create: `lyra/app/api/posts/[id]/boost/route.ts`

**Context:**  
This is a new nested route under the existing `[id]` segment. It has two handlers:
- `POST` — validates plan (reject STARTER), fetches post (must be PUBLISHED and have `platformPostId`), fetches the matching SocialAccount (to get `adAccountId` and decrypt `accessToken`), calls `createBoost()`, deletes any existing ended/cancelled PostBoost record for this post, then creates the new PostBoost.
- `DELETE` — calls `cancelBoost()`, updates `PostBoost.status` to CANCELLED.

The workspace plan is fetched via the workspace that owns the post. The `postId` is extracted from route params (`params.id`). The SocialAccount is fetched via `post.socialAccountId`.

- [ ] **Step 1: Check existing [id] route structure**

Verify the directory `lyra/app/api/posts/[id]/` exists:

```bash
ls "lyra/app/api/posts/[id]/"
```

Expected: `route.ts` exists there already.

- [ ] **Step 2: Create the boost route**

Create `lyra/app/api/posts/[id]/boost/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { createBoost, cancelBoost } from '@/services/social/meta-ads'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: postId } = await params
    const body = await req.json() as {
      budget: number
      durationDays: number
      audience: 'followers' | 'followers_lookalike' | 'broad'
    }
    const { budget, durationDays, audience } = body

    if (!budget || !durationDays || !audience) {
      return NextResponse.json({ error: 'budget, durationDays, and audience required' }, { status: 400 })
    }

    // Fetch post and verify workspace access
    const post = await prisma.post.findFirst({
      where: { id: postId },
      include: {
        workspace: { select: { id: true, plan: true } },
        socialAccount: true,
      },
    })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: post.workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Plan gate — STARTER cannot boost
    if (post.workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Boosting requires Pro or Agency plan' }, { status: 403 })
    }

    // Post must be published with a platformPostId
    if (post.status !== 'PUBLISHED' || !post.platformPostId) {
      return NextResponse.json({ error: 'Post must be published to boost' }, { status: 400 })
    }

    // Platform must be Facebook or Instagram
    const platform = post.socialAccount.platform
    if (platform !== 'FACEBOOK' && platform !== 'INSTAGRAM') {
      return NextResponse.json({ error: 'Boosting is only available for Facebook and Instagram posts' }, { status: 400 })
    }

    // Must have an ad account configured
    if (!post.socialAccount.adAccountId) {
      return NextResponse.json({ error: 'No Facebook Ad Account connected. Connect one in Facebook Business Manager.' }, { status: 400 })
    }

    const accessToken = decrypt(post.socialAccount.accessToken)
    const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

    // Call Meta — this may throw if the post is ineligible or ad account is suspended
    const { adCampaignId, adSetId, adId } = await createBoost({
      pageId: post.socialAccount.platformId,
      platformPostId: post.platformPostId,
      adAccountId: post.socialAccount.adAccountId,
      accessToken,
      budget,
      durationDays,
      audience,
    })

    // Remove any existing ended/cancelled boost for this post before creating the new one
    await prisma.postBoost.deleteMany({
      where: {
        postId,
        status: { in: ['ENDED', 'CANCELLED', 'FAILED'] },
      },
    })

    const boost = await prisma.postBoost.create({
      data: {
        postId,
        platform,
        adCampaignId,
        adSetId,
        adId,
        budget,
        durationDays,
        audience,
        status: 'ACTIVE',
        endsAt,
      },
    })

    return NextResponse.json(boost, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('POST /api/posts/[id]/boost error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: postId } = await params

    const post = await prisma.post.findFirst({
      where: { id: postId },
      include: {
        socialAccount: true,
        boost: true,
      },
    })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: post.workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!post.boost || post.boost.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'No active boost to cancel' }, { status: 400 })
    }

    const accessToken = decrypt(post.socialAccount.accessToken)

    // Pause campaign on Meta — if this fails, we return an error and leave status as ACTIVE
    await cancelBoost({ adCampaignId: post.boost.adCampaignId, accessToken })

    const updated = await prisma.postBoost.update({
      where: { id: post.boost.id },
      data: { status: 'CANCELLED' },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('DELETE /api/posts/[id]/boost error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "lyra/app/api/posts/[id]/boost/route.ts"
git commit -m "feat: add POST and DELETE handlers for /api/posts/[id]/boost"
```

---

### Task 6: Include Boost in Posts Query

**Files:**
- Modify: `lyra/app/api/posts/route.ts`

**Context:**  
The GET handler in `posts/route.ts` uses a `select` clause that lists specific fields. We need to add `boost` to that select so the calendar and detail panel have boost data without a separate fetch. The `boost` field returns the full `PostBoost` record or `null`.

- [ ] **Step 1: Add boost to the select clause**

In `lyra/app/api/posts/route.ts`, find the `select` block inside `prisma.post.findMany`. Change:

```typescript
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        mediaUrls: true,
        aiGenerated: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true } },
      },
```

To:

```typescript
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        platformPostId: true,
        mediaUrls: true,
        aiGenerated: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost: true,
      },
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lyra/app/api/posts/route.ts
git commit -m "feat: include boost relation and platformPostId in posts GET query"
```

---

### Task 7: Post Detail Panel — Boost UI

**Files:**
- Modify: `lyra/components/lyra/calendar/post-preview-card.tsx`
- Modify: `lyra/components/lyra/calendar/post-detail-panel.tsx`
- Modify: `lyra/components/lyra/calendar/content-calendar.tsx` (pass plan prop)

**Context:**  
The panel renders inside `content-calendar.tsx`, which passes `post` and `workspaceId` as props. We need to also pass the workspace `plan` so the panel can gate the boost section. The `CalendarPost` type in `post-preview-card.tsx` must be extended with the new fields returned by the updated posts query.

Three boost states render inside the panel body, below existing content:
- State 1 (no boost): chip selectors + CTA button
- State 2 (active boost): Live badge, stat tiles, cancel button
- State 3 (ended/cancelled): Ended badge, stat tiles, Boost again CTA

The section is hidden entirely if: post is not PUBLISHED, platform is not FACEBOOK or INSTAGRAM, plan is STARTER, or post has no `platformPostId`.

- [ ] **Step 1: Extend CalendarPost type**

In `lyra/components/lyra/calendar/post-preview-card.tsx`, change the `CalendarPost` interface from:

```typescript
export interface CalendarPost {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  socialAccount: { platform: string; name: string }
}
```

To:

```typescript
export interface PostBoost {
  id: string
  budget: number
  durationDays: number
  audience: string
  status: string
  adCampaignId: string
  endsAt: string
  startedAt: string
}

export interface CalendarPost {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformPostId: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  socialAccount: { platform: string; name: string; platformId: string; adAccountId: string | null }
  boost: PostBoost | null
}
```

- [ ] **Step 2: Find where content-calendar passes props to PostDetailPanel**

Read `lyra/components/lyra/calendar/content-calendar.tsx` and find the `<PostDetailPanel` usage. Note the current props so you know what to add.

- [ ] **Step 3: Add plan prop to PostDetailPanel and wire it up**

In `lyra/components/lyra/calendar/content-calendar.tsx`, add `plan` to the `<PostDetailPanel` call. The `plan` value comes from the workspace data already available in the calendar page. If the calendar page doesn't currently pass the plan down, check `lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` and thread it through.

The plan prop is typed as `'STARTER' | 'PRO' | 'AGENCY'`.

- [ ] **Step 4: Implement the boost section in PostDetailPanel**

Replace the full contents of `lyra/components/lyra/calendar/post-detail-panel.tsx` with the following. This preserves all existing functionality and adds the boost section:

```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Trash2, ExternalLink, CalendarIcon, Loader2, Zap } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  CalendarPost,
  PostBoost,
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  STATUS_COLORS,
} from './post-preview-card'

const STATUS_LABEL: Record<string, string> = {
  DRAFT:            'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED:         'Approved',
  SCHEDULED:        'Scheduled',
  PUBLISHING:       'Publishing',
  PUBLISHED:        'Published',
  FAILED:           'Failed',
  CANCELLED:        'Cancelled',
}

const NEXT_STATUSES: Record<string, { value: string; label: string }[]> = {
  DRAFT:      [{ value: 'SCHEDULED', label: 'Mark as scheduled' }],
  SCHEDULED:  [
    { value: 'DRAFT',     label: 'Move back to draft' },
    { value: 'CANCELLED', label: 'Cancel post' },
  ],
  FAILED:     [{ value: 'DRAFT', label: 'Move back to draft' }],
  CANCELLED:  [{ value: 'DRAFT', label: 'Move back to draft' }],
}

const BUDGET_OPTIONS = [1000, 2500, 5000, 10000] // cents
const DURATION_OPTIONS = [3, 7, 14, 30]
const AUDIENCE_OPTIONS: { value: 'followers' | 'followers_lookalike' | 'broad'; label: string }[] = [
  { value: 'followers',          label: 'Page followers' },
  { value: 'followers_lookalike', label: 'Followers + similar' },
  { value: 'broad',              label: 'Broad reach' },
]

function formatBudget(cents: number) {
  return `$${cents / 100}`
}

function daysLeft(endsAt: string) {
  return Math.max(0, differenceInDays(new Date(endsAt), new Date()))
}

interface Props {
  post: CalendarPost | null
  workspaceId: string
  plan: 'STARTER' | 'PRO' | 'AGENCY'
  onClose: () => void
  onDeleted: (id: string) => void
  onUpdated: (updated: CalendarPost) => void
}

export function PostDetailPanel({ post, workspaceId, plan, onClose, onDeleted, onUpdated }: Props) {
  const [deleting, setDeleting]             = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [boosting, setBoosting]             = useState(false)
  const [cancelling, setCancelling]         = useState(false)
  const [selectedBudget, setSelectedBudget]     = useState(2500)
  const [selectedDuration, setSelectedDuration] = useState(7)
  const [selectedAudience, setSelectedAudience] = useState<'followers' | 'followers_lookalike' | 'broad'>('followers')
  const [boostError, setBoostError]         = useState<string | null>(null)
  const shouldReduceMotion                  = useReducedMotion()

  async function handleDelete() {
    if (!post) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Post deleted')
      onDeleted(post.id)
      onClose()
    } catch {
      toast.error('Failed to delete post')
    } finally {
      setDeleting(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!post) return
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Update failed')
      const updated = await res.json() as CalendarPost
      toast.success('Status updated')
      onUpdated(updated)
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleBoost() {
    if (!post) return
    setBoostError(null)
    setBoosting(true)
    try {
      const res = await fetch(`/api/posts/${post.id}/boost`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          budget:      selectedBudget,
          durationDays: selectedDuration,
          audience:    selectedAudience,
        }),
      })
      const data = await res.json() as PostBoost & { error?: string }
      if (!res.ok) {
        setBoostError(data.error ?? 'Boost failed')
        return
      }
      toast.success('Boost started')
      onUpdated({ ...post, boost: data })
    } catch {
      setBoostError('Boost failed. Check your connection and try again.')
    } finally {
      setBoosting(false)
    }
  }

  async function handleCancelBoost() {
    if (!post) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/posts/${post.id}/boost`, { method: 'DELETE' })
      const data = await res.json() as PostBoost & { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to cancel boost')
        return
      }
      toast.success('Boost cancelled')
      onUpdated({ ...post, boost: data })
    } catch {
      toast.error('Failed to cancel boost')
    } finally {
      setCancelling(false)
    }
  }

  const date          = post?.scheduledAt
  const platformColor = post ? (PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']) : PLATFORM_COLORS['TWITTER']
  const nextStatuses  = post ? (NEXT_STATUSES[post.status] ?? []) : []

  const canBoost = post &&
    post.status === 'PUBLISHED' &&
    post.platformPostId &&
    (post.socialAccount.platform === 'FACEBOOK' || post.socialAccount.platform === 'INSTAGRAM') &&
    plan !== 'STARTER'

  const boost = post?.boost ?? null
  const boostState: 'none' | 'active' | 'ended' = !boost
    ? 'none'
    : boost.status === 'ACTIVE'
      ? 'active'
      : 'ended'

  return (
    <AnimatePresence>
      {post && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 bg-background-primary/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Slide-in panel */}
          <motion.div
            key="panel"
            initial={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={shouldReduceMotion ? { duration: 0.15 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 h-full w-full max-w-sm z-50 bg-background-secondary border-l border-background-border flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Post details"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-background-border">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="rounded-full shrink-0"
                  style={{ width: 8, height: 8, backgroundColor: platformColor }}
                  aria-hidden="true"
                />
                <span className="font-sans text-xs text-text-secondary truncate">
                  {PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}
                  {' · '}
                  {post.socialAccount.name}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="flex items-center justify-center min-h-[44px] min-w-[44px] text-text-tertiary hover:text-text-secondary transition-colors shrink-0 ml-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary rounded-md"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'font-sans text-xs px-2 py-0.5 rounded-md font-medium',
                    STATUS_COLORS[post.status] ?? 'bg-background-hover text-text-tertiary'
                  )}
                >
                  {STATUS_LABEL[post.status] ?? post.status}
                </span>
                {post.aiGenerated && (
                  <span className="font-sans text-[10px] text-text-tertiary px-2 py-0.5 rounded-md bg-background-hover border border-background-border uppercase tracking-wide">
                    AI
                  </span>
                )}
              </div>

              {/* Full content */}
              <div className="space-y-1.5">
                <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                  Content
                </p>
                <p className="font-sans text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                  {post.content || <span className="text-text-tertiary italic">No content</span>}
                </p>
              </div>

              {/* Date */}
              {date && (
                <div className="flex items-center gap-2">
                  <CalendarIcon size={12} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
                  <span className="font-mono text-xs text-text-secondary">
                    {format(new Date(date), "MMM d, yyyy '·' h:mm a")}
                  </span>
                </div>
              )}

              {/* Media count */}
              {post.mediaUrls.length > 0 && (
                <p className="font-sans text-xs text-text-tertiary">
                  {post.mediaUrls.length} media {post.mediaUrls.length === 1 ? 'file' : 'files'} attached
                </p>
              )}

              {/* Status transition actions */}
              {nextStatuses.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                    Actions
                  </p>
                  {nextStatuses.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleStatusChange(value)}
                      disabled={updatingStatus}
                      className="inline-flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-background-border font-sans text-xs text-text-secondary hover:border-background-border-mid hover:text-text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary"
                    >
                      {updatingStatus && <Loader2 size={10} strokeWidth={1.5} className="animate-spin shrink-0" />}
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* ── Boost section ── */}
              {canBoost && (
                <div className="pt-1">
                  <div className="bg-background-tertiary border border-background-border rounded-xl p-4 space-y-3">

                    {/* State 1: No boost yet */}
                    {boostState === 'none' && (
                      <>
                        <p className="font-sans text-[11px] font-medium text-text-secondary uppercase tracking-[0.1em]">
                          Boost this post
                        </p>

                        {/* No ad account */}
                        {!post.socialAccount.adAccountId ? (
                          <p className="font-sans text-xs text-text-tertiary">
                            Connect a Facebook Ad Account to enable boosting.{' '}
                            <a
                              href="https://business.facebook.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors"
                            >
                              Open Facebook Business Manager
                            </a>
                          </p>
                        ) : (
                          <>
                            {/* Budget chips */}
                            <div className="space-y-1.5">
                              <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Budget</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {BUDGET_OPTIONS.map((b) => (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() => setSelectedBudget(b)}
                                    className={cn(
                                      'font-sans text-[11px] px-2 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary',
                                      selectedBudget === b
                                        ? 'bg-background-hover border-accent-silver text-text-primary'
                                        : 'bg-background-secondary border-background-border text-text-secondary hover:border-background-border-mid'
                                    )}
                                  >
                                    {formatBudget(b)}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Duration chips */}
                            <div className="space-y-1.5">
                              <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Duration</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {DURATION_OPTIONS.map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => setSelectedDuration(d)}
                                    className={cn(
                                      'font-sans text-[11px] px-2 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary',
                                      selectedDuration === d
                                        ? 'bg-background-hover border-accent-silver text-text-primary'
                                        : 'bg-background-secondary border-background-border text-text-secondary hover:border-background-border-mid'
                                    )}
                                  >
                                    {d} days
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Audience chips */}
                            <div className="space-y-1.5">
                              <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Audience</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {AUDIENCE_OPTIONS.map(({ value, label }) => (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => setSelectedAudience(value)}
                                    className={cn(
                                      'font-sans text-[11px] px-2 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary',
                                      selectedAudience === value
                                        ? 'bg-background-hover border-accent-silver text-text-primary'
                                        : 'bg-background-secondary border-background-border text-text-secondary hover:border-background-border-mid'
                                    )}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {boostError && (
                              <p className="font-sans text-xs text-status-error">{boostError}</p>
                            )}

                            <button
                              type="button"
                              onClick={handleBoost}
                              disabled={boosting}
                              className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-tertiary"
                            >
                              {boosting
                                ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                                : <Zap size={12} strokeWidth={1.5} />
                              }
                              {boosting ? 'Starting boost…' : `Boost for ${formatBudget(selectedBudget)} · ${selectedDuration} days`}
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {/* State 2: Active boost */}
                    {boostState === 'active' && boost && (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="font-sans text-[11px] font-medium text-text-secondary uppercase tracking-[0.1em]">Boost active</p>
                          <span className="font-sans text-[10px] text-status-success bg-status-success/10 border border-status-success/20 rounded-full px-2 py-0.5">
                            Live
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: formatBudget(boost.budget), label: 'Budget' },
                            { value: String(daysLeft(boost.endsAt)), label: 'Days left' },
                            { value: '—', label: 'Reached' },
                          ].map(({ value, label }) => (
                            <div key={label} className="bg-background-secondary border border-background-border rounded-lg p-2 text-center">
                              <p className="font-mono text-sm text-text-primary">{value}</p>
                              <p className="font-sans text-[10px] text-text-tertiary mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        <p className="font-sans text-[10px] text-text-tertiary">
                          {AUDIENCE_OPTIONS.find((a) => a.value === boost.audience)?.label ?? boost.audience}
                          {' · ends '}
                          {format(new Date(boost.endsAt), 'MMM d, yyyy')}
                        </p>

                        <button
                          type="button"
                          onClick={handleCancelBoost}
                          disabled={cancelling}
                          className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-background-border-mid text-text-secondary font-sans text-xs transition-colors hover:border-status-error hover:text-status-error disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-tertiary"
                        >
                          {cancelling && <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />}
                          {cancelling ? 'Cancelling…' : 'Cancel boost'}
                        </button>
                      </>
                    )}

                    {/* State 3: Ended/Cancelled boost */}
                    {boostState === 'ended' && boost && (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Previous boost</p>
                          <span className="font-sans text-[10px] text-text-tertiary bg-background-hover border border-background-border rounded-full px-2 py-0.5">
                            {boost.status === 'CANCELLED' ? 'Cancelled' : 'Ended'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: formatBudget(boost.budget), label: 'Spent' },
                            { value: String(boost.durationDays), label: 'Days ran' },
                            { value: '—', label: 'Reached' },
                          ].map(({ value, label }) => (
                            <div key={label} className="bg-background-secondary border border-background-border rounded-lg p-2 text-center">
                              <p className="font-mono text-sm text-text-secondary">{value}</p>
                              <p className="font-sans text-[10px] text-text-tertiary mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        {boostError && (
                          <p className="font-sans text-xs text-status-error">{boostError}</p>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setBoostError(null)
                            onUpdated({ ...post, boost: null })
                          }}
                          className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-tertiary"
                        >
                          <Zap size={12} strokeWidth={1.5} />
                          Boost again
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-background-border flex items-center justify-between">
              <a
                href={`/workspace/${workspaceId}/compose`}
                className="inline-flex items-center gap-1.5 min-h-[44px] font-sans text-xs text-text-tertiary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary rounded-md px-1"
              >
                <ExternalLink size={12} strokeWidth={1.5} />
                Edit in Composer
              </a>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 min-h-[44px] font-sans text-xs text-status-error hover:opacity-80 transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary rounded-md px-1"
              >
                {deleting ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Trash2 size={12} strokeWidth={1.5} />}
                {deleting ? 'Deleting…' : 'Delete post'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 5: Update content-calendar.tsx to pass plan prop**

Read `lyra/components/lyra/calendar/content-calendar.tsx` to find the `<PostDetailPanel` usage and the component's own props interface. Add `plan: 'STARTER' | 'PRO' | 'AGENCY'` to the calendar's props and thread it through to `<PostDetailPanel plan={plan} />`.

Also read `lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` to confirm the workspace plan is available and pass it down to the calendar component.

- [ ] **Step 6: Type-check**

```bash
npm run type-check
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 7: Commit**

```bash
git add lyra/components/lyra/calendar/post-preview-card.tsx
git add lyra/components/lyra/calendar/post-detail-panel.tsx
git add lyra/components/lyra/calendar/content-calendar.tsx
git add "lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx"
git commit -m "feat: add boost UI to PostDetailPanel (three states: no boost, active, ended)"
```

---

## Spec Coverage Check

| Spec requirement | Covered in task |
|---|---|
| PostBoost model + BoostStatus enum | Task 1 |
| adAccountId on SocialAccount | Task 1 |
| boost relation on Post | Task 1 |
| createBoost / cancelBoost / getBoostReach | Task 2 |
| Campaign objective POST_ENGAGEMENT, lifetime_budget in cents | Task 2 |
| Audience targeting mappings (followers/lookalike/broad) | Task 2 |
| ads_management scope + fetchAdAccountId | Task 3 |
| Store adAccountId at OAuth time | Task 4 |
| Also store on INSTAGRAM account created from same page token | Task 4 |
| POST /api/posts/[id]/boost — plan gate, PUBLISHED check, createBoost, upsert | Task 5 |
| DELETE /api/posts/[id]/boost — cancelBoost, status → CANCELLED | Task 5 |
| Include boost in GET /api/posts | Task 6 |
| Panel hidden for STARTER / non-published / non-FB-IG / no platformPostId | Task 7 |
| State 1: budget/duration/audience chips + CTA | Task 7 |
| State 2: Live badge, stat tiles, cancel button | Task 7 |
| State 3: Ended badge, stat tiles, Boost again CTA | Task 7 |
| No ad account message | Task 7 |
| Meta error surfaced inline | Task 5 (API) + Task 7 (UI boostError) |
| Cancel failure leaves status ACTIVE | Task 5 (no update if cancelBoost throws) |
| Boost again resets to State 1 | Task 7 (onUpdated with boost: null) |

## Post-Implementation: Apply Schema

After all tasks are committed, apply the schema via Supabase SQL Editor:

```sql
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

Then run `npx prisma generate` and `npm run type-check` one final time.
