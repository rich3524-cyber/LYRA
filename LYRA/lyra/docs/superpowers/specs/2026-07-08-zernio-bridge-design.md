# Zernio Bridge — Social Provider Abstraction (Design)

**Date:** 2026-07-08
**Status:** Approved design — ready for implementation planning
**Author:** Claude Code (with Richard Unwin, Into The Wild Marketing)

---

## Purpose

LYRA's blocker to beta is per-platform app review (Meta, TikTok, LinkedIn, GBP). **Zernio** (unified social API, formerly Getlate.dev) provides pre-approved platform apps, so end-users authorise through Zernio's OAuth and LYRA can post/read/reply across all platforms **without its own platform app reviews**.

This design introduces a **provider abstraction** so LYRA can run every platform through Zernio during beta, then **pivot each platform back to its native integration** — as its own app review lands — by flipping one field, with no business-logic rewrite.

**Zernio is a temporary, disposable bridge.** The design's primary constraint is that it can be removed per-platform without touching call sites. The one exception is Google Business reviews: the native path was rejected (case `5-5485000041034`) and Zernio may remain the permanent home for that capability. Full context is in `LYRA-Handover.md` (Google Business + Zernio sections).

### Guardrails (non-negotiable)
1. **Disposable by design** — a single provider seam; pivot-back per platform = one field change.
2. **Product uses Zernio's REST API, not the MCP.** The MCP is for AI-agent chat contexts only.
3. **Beta-trust posture** — written data-usage confirmation and uptime/SLA are still open with Zernio; fine to build/beta on, but do not graduate paying GA customers onto Zernio until closed.
4. **Test on own accounts only** — no comment-flow sandbox exists (WhatsApp-only). First runs use ITWM / a test brand, never a client's data.

---

## Scope

**In scope (first build):**
- Connect accounts via Zernio (all platforms) — hosted white-label flow
- Publish / schedule posts via Zernio
- Comment inbox: ingest via webhooks → existing AI-responder pipeline → reply
- Google Business Profile reviews: read + reply (net-new **Customer Voice** surface)

**Explicitly out of scope:**
- Ads / boosting via Zernio (keep native Meta path)
- DMs, WhatsApp, SMS, voice, and other Zernio capabilities
- Headless connect UI (use Zernio's hosted white-label page)
- Handing post scheduling to Zernio (LYRA remains the scheduler/source of truth)

**Decisions locked during brainstorming:**
| Decision | Choice |
|---|---|
| First-slice capabilities | Publish + comment inbox + GBP reviews |
| Platforms via Zernio | **All** platforms during the bridge (uniform dispatch) |
| Connect UX | Zernio hosted **white-label** page |
| Ingestion | Zernio **webhooks** (push), poll fallback if events unavailable |
| Architecture | **Provider interface** (Approach A) |

---

## Architecture — Provider seam (Approach A)

A single interface every call site speaks to; two implementations; a factory that dispatches on a per-account field.

```
call sites (publish route, workers, comment routes, Customer Voice)
        │  getProvider(account).<method>(...)
        ▼
   SocialProvider  (interface)
    ├── zernioProvider   → ZernioClient (REST, all platforms)   [active in beta]
    └── nativeProvider   → existing services/social/*.ts        [dormant; pivot-back target]
```

### Interface — `services/social/provider/types.ts`
```ts
interface SocialProvider {
  publish(account, content, media?):         Promise<{ platformPostId: string }>
  fetchRecentComments(account):              Promise<NormalizedComment[]>  // manual Sync / backfill
  replyToComment(account, externalId, text): Promise<void>
  fetchReviews(account):                     Promise<NormalizedReview[]>   // Customer Voice load
  replyToReview(account, externalId, text):  Promise<void>
}
```
`NormalizedComment` / `NormalizedReview` are LYRA-internal shapes. Nothing outside the provider layer ever sees a Zernio or Graph API payload.

### Implementations
- **`provider/native.ts`** — wraps existing `services/social/*.ts`, dispatches internally by `account.platform`; throws `ProviderUnsupported` for what native can't do (e.g. GBP reviews). Essentially today's code moved behind the interface. Dormant during beta, intact for pivot-back.
- **`provider/zernio.ts`** — one implementation for all platforms (Zernio hides per-platform differences), built on `ZernioClient`.

### Factory — `services/social/provider/index.ts`
```ts
getProvider(account) => account.provider === 'ZERNIO' ? zernioProvider : nativeProvider
```

### `ZernioClient` — `services/social/zernio-client.ts`
Thin REST wrapper over `https://zernio.com/api/v1`, auth `ZERNIO_API_KEY` bearer, **server-side only**. The *only* file that knows Zernio's HTTP shape. Methods: create/publish post, list inbox comments, reply to comment, get GBP reviews, reply to review, get connect URL, create profile, manage webhook settings. Backs off on 429.

---

## Data model

All additive; nothing existing breaks. Applied via **Supabase SQL Editor** (per project rule — no `prisma db push`).

### `SocialAccount` — add
- `provider` enum (`NATIVE` | `ZERNIO`, default `ZERNIO` during the bridge) — the dispatch field
- `zernioAccountId String?` — Zernio's ID for this account (target of every Zernio call)
- `accessToken` → **nullable** (Zernio accounts hold no platform token; native accounts keep populating it)

### `Workspace` — add
- `zernioProfileId String?` — one Zernio **profile per workspace/brand**, created lazily on first connect (the "brand" container in Zernio's Profiles→Accounts model)

### `Review` — new model (net-new; no Review model exists today)
```
Review {
  id             String   @id @default(cuid())
  workspaceId    String
  socialAccountId String
  zernioReviewId String
  rating         Int?
  text           String?
  authorName     String?
  status         String   // e.g. NEW / REPLIED / SKIPPED
  replyText      String?
  createdAt      DateTime @default(now())
  reviewedAt     DateTime?
  @@unique([socialAccountId, zernioReviewId])
}
```

### `Comment` — no schema change
Zernio's comment ID lands in existing `platformCommentId`; replies target the account's `zernioAccountId`.

---

## Flows

### Connect (Zernio hosted white-label)
1. User clicks *Connect [platform]* in workspace settings.
2. `/api/social/connect/[platform]`: if workspace has no `zernioProfileId`, `ZernioClient.createProfile(workspace.name)` and store it. Then `getConnectUrl(platform, profileId, redirect=/api/zernio/connect/callback)` → redirect user to Zernio's white-label page.
3. User authorises + selects page/org on Zernio's hosted page; Zernio redirects back with `accountId`.
4. `/api/zernio/connect/callback`: verify workspace access (reuse existing cross-tenant check), upsert `SocialAccount` (`provider=ZERNIO`, `zernioAccountId`, name/handle from Zernio, `accessToken=null`), ensure webhook subscription exists, redirect to `settings?connected=…`. Reuses the existing `?error=` banner for failures.

### Publish
- Direct route `/api/posts/[id]/publish` and the BullMQ post-publisher worker swap hardcoded native calls for `getProvider(account).publish(...)`.
- **LYRA stays the scheduler**: BullMQ fires at `scheduledAt` → `publish` → Zernio publish-now. Calendar + approval workflow remain LYRA's source of truth.
- `platformPostId` captured from the publish response and/or the `post.platform.published` webhook; post → `PUBLISHED`.

### Ingestion (webhooks push)
- New `/api/zernio/webhook` (POST): verify Zernio signature (timing-safe), then route events:
  - inbound comment → `NormalizedComment` → upsert `Comment` (matched to account by `zernioAccountId`) → enqueue the **existing** AI-responder pipeline, honouring workspace `aiResponseMode`.
  - inbound GBP review → upsert `Review` → optional AI draft.
  - `post.platform.published` / `failed` → update post status + `platformPostId`.
  - `account.disconnected` → mark `SocialAccount` inactive.
- Existing **Sync** button remains, backed by `fetchRecentComments` (manual reconcile).

**Webhook events — CONFIRMED (founder, 2026-07-08):**
- Meta comments → `comment.received` webhook, **seconds** latency.
- GBP reviews → `review.new` / `review.updated` webhooks (Google Pub/Sub), **seconds**, real-time.
- LinkedIn comments → **no LinkedIn webhook exists**; Zernio polls company pages ~every 10 min (backing off as posts age) and delivers on the same webhook channel. LYRA needs no change — LinkedIn comment responses simply run up to ~10 min behind; Meta + GBP are real-time.

Build straight to webhooks for all three. No poll fallback needed on LYRA's side (LinkedIn polling is Zernio-internal).

---

## Config & security
- `ZERNIO_API_KEY` — single master key, server-side only, added to **Netlify and Railway** (workers need it). Never client-exposed.
- `ZERNIO_WEBHOOK_SECRET` — webhook signature verification (timing-safe compare, same pattern as `CRON_SECRET`).
- `SocialAccount.provider` is the switch — no global flag required. Optional `ZERNIO_ENABLED` kill-switch env.
- Connect callback reuses existing cross-tenant workspace-access check. For Zernio accounts LYRA stores **no** platform token, shrinking its secret surface.

## Error handling
- Provider methods throw typed errors; routes surface sanitised messages (existing 502-with-message pattern). Publish failure → post stays un-published, error shown.
- Webhook endpoint returns 200 fast, processes **idempotently** — dedupe on event/comment/review ID so Zernio retries cannot double-post replies or duplicate rows.
- `ZernioClient` backs off on 429.

## Testing
- **Own accounts only** (ITWM / test brand) — no comment-flow sandbox.
- Unit: payload mapping (Zernio ↔ Normalized), `getProvider` dispatch, webhook signature verify, event routing (mocked payloads).
- End-to-end manual: connect → publish → verify on-platform → comment → verify webhook ingest + AI draft → reply → verify on-platform. GBP: connect a test location → load reviews → reply.
- Test-first per project TDD approach.

## Pivot-back (per platform, no rewrite)
When a platform's native app review lands: users reconnect that platform via the still-intact **native** connect flow (repopulating the platform token), and its accounts flip `provider → NATIVE`. Runtime dispatch follows the field; no business-logic edits. New connects can default to `NATIVE` for that platform once ready. **GBP reviews** may stay on Zernio permanently if native GBP never clears.

---

## Cost note
Zernio is **absorbed as LYRA COGS — not passed through to clients**. Per connected account: free first 2, then ~$6/account/mo (3–10), $3 (11–100), $1 (101–2000); X fees metered pass-through. Trivial at beta scale; shrinks toward zero as platforms pivot back to native. GBP-reviews slice may be permanent COGS.

## Open items (track, not blocking beta build)
Most cleared by Zernio founder Miki, 2026-07-08 (see Handover → Zernio section):
- ✅ Webhook events (comment.received, review.new/updated) + latency (seconds; LinkedIn ~10 min poll)
- ✅ Written data-usage confirmation received
- ✅ Sandbox: none — validate on free tier with own test accounts (webhook delivery logs in dashboard)
- ✅ Commercial: month-to-month, no lock-in; ~$718/mo at 500 accounts
- ⚠️ **No contractual SLA / no published uptime** — status.zernio.com only. GA-trust caveat, not a beta blocker; weigh before making GBP-reviews a permanent dependency.
- Still open (non-blocking): end-user disclosure requirements about Zernio's role; exact X rate-limit tier.

## Files (anticipated)
**New:** `services/social/provider/{types,index,native,zernio}.ts`, `services/social/zernio-client.ts`, `app/api/zernio/connect/callback/route.ts`, `app/api/zernio/webhook/route.ts`, `Review` model + minimal Customer Voice UI, migration SQL.
**Modified:** `app/api/social/connect/[platform]/route.ts`, `app/api/posts/[id]/publish/route.ts`, post-publisher + comment-monitor workers, `app/api/comments/[id]/reply` + `comments/sync`, `prisma/schema.prisma`.
