# Slack Notifications + Approval SLA Tracking — Design

**Date:** 2026-08-11
**Status:** Approved for build
**Source doc:** `Scope Docs - Future projects/LYRA-Slack-Teams-Scope.docx` (v1.0)
**Wishlist item:** 8 (Slack/Microsoft Teams notifications)

---

## 1. Scope

Two features, built together because the second has no delivery surface without the first:

1. **Slack channel notifications** — LYRA posts event alerts to a workspace's Slack channel via an incoming-webhook URL the customer pastes in.
2. **Approval SLA tracking** — a new concept of an approval being *late*, which does not currently exist anywhere in LYRA. Detection, thresholds, an in-app indicator, and one of the five notification events.

**Microsoft Teams is explicitly out of scope for this build.** The delivery service is built with a per-platform formatter seam so Teams is a second formatter plus a setup guide, not a second integration.

### Decisions taken (Richard, 2026-08-11)

| Decision | Choice |
|---|---|
| Delivery mechanism | **Zernio OAuth connection**, not an incoming webhook (revised — see §2) |
| Platform scope | Slack first; Teams deferred |
| Events | Crisis, publish failure, pending approval, SLA breach, post published. Weekly digest dropped (blocked on Email digest, Wishlist item 6) |
| Access | Agency plan, **or** Pro with the Crisis Aware add-on. Pro gets the **full** event set, not crisis-only |
| Channels | Exactly one per workspace |
| SLA basis | N hours before the post's own `scheduledAt` |
| SLA fallback | Posts with no `scheduledAt` use hours-since-submission instead |
| SLA config | Per-workspace setting with a shipped default |
| SLA default | 4 hours before scheduled time |
| SLA cadence | Once per post, per submission |
| SLA surface | Slack channel **and** an in-app indicator. No email |

### Deltas from scope doc v1.0

These correct or extend the source document and should be folded into a v1.1 revision:

1. **§7 is wrong.** It states Agency-plan-only. The agreed gate also admits Pro workspaces holding the Crisis Aware add-on, with full event access.
2. **§2.1 overstates existing wiring.** It says the crisis, publish-failure, and approval-pending code paths "already power the shipped Crisis Aware email alert." Only crisis does. The crisis email is the sole notification in the entire application. Publish-failure and pending-approval are status transitions with no notification hook; each needs one added.
3. **§5 treats SLA breach as one row in an events table.** It is the largest single piece of work in this build — see §5 below.
4. **§6.1's data model is incomplete.** It needs `PostApproval.submittedAt`, a once-only fired flag, and two `Workspace` threshold columns.
5. **§9's build order omits the cron.** SLA detection needs a new `/api/cron/*` route *and* a manually-created cron-job.org entry.
6. **Weekly digest removed** from the event set, per §10's own recommendation.
7. **§2.1, §3.1 and the entire webhook architecture are superseded.** Slack connects through Zernio OAuth, not a customer-created incoming webhook. This also delivers §9 step 5 ("Add to Slack", listed as an optional v2) in v1, and makes §8's "webhook URL leakage" risk row moot. See §2.

---

## 2. Delivery mechanism — revised to Zernio

The scope doc and the first draft of this spec assumed a Slack incoming webhook: the customer creates a Slack App, enables Incoming Webhooks, and pastes the resulting URL into LYRA. Richard raised that Zernio — already LYRA's unified social API — added Slack as a supported platform. Verified, and the decision is to use it.

**What Zernio gives us**

- One-click OAuth from Settings, using the connect flow LYRA already has. Zernio owns the OAuth, the Slack app, and token rotation. No Slack App creation by the customer at all — this is the "Add to Slack" experience the scope doc parked as a v2 enhancement (§9 step 5), available in v1.
- One connected Zernio account = one Slack channel, which matches the one-channel-per-workspace decision exactly.
- Public channels are joined automatically. Private channels need a workspace member to run `/invite @Zernio` first — an app cannot add itself to a private channel.
- Per-message bot identity override via `username` and `iconUrl`, so messages can still be branded as LYRA.
- No webhook URL to store, encrypt, redact, or leak. The only credential is `ZERNIO_API_KEY`, already in env.

**What it costs us, accepted knowingly**

- **Per-connected-account billing.** Zernio prices per connected account, so every workspace's alert channel is billable — a recurring cost on a feature that is bundled rather than separately monetised.
- **No Block Kit.** Zernio's Slack surface is messages, files, and thread replies. The deep-link-back-to-LYRA button becomes a labelled mrkdwn link (`<url|Review in Inbox>`) rather than a real button. Clickable and clear, but not the scope doc's §3.2 UX.
- **Alert delivery now depends on Zernio's uptime and quota**, including for crisis alerts. Mitigated by the crisis email remaining the baseline path — a dead channel is never the only route.
- **The Zernio Slack app has not been reviewed by Slack.** Expected for a distributed app that isn't marketplace-listed, but customers may see a warning on install.

**Unverified, must be confirmed live:** the exact payload location of `username` / `iconUrl`. Zernio documents `platforms[].platformSpecificData` as the per-platform options object, but their published platform guide still covers only the 14 platforms that predate Slack, so Slack's own fields are undocumented. This build places them in `platformSpecificData`, following the documented pattern. If Zernio ignores unknown fields the message still delivers — it just posts under the Zernio identity instead of LYRA's. Degraded, not broken. **Confirm on the first real connected channel.**

### Keeping Slack out of the publishing model

The connection is made through Zernio's OAuth but is **not** stored as a `SocialAccount`. A `SocialAccount` row would put the alert channel into the compose platform selector, the content calendar, analytics, and — worst — the comment-sync cron, which iterates `SocialAccount` and would ingest Zernio's Slack inbox (DMs to the bot, channel mentions) into LYRA's Inbox as brand comments to reply to.

It gets its own `NotificationChannel` table instead, so none of those surfaces ever see it. `Platform` gains no `SLACK` member, which also keeps the exhaustive `PLATFORM_TO_ZERNIO` map in `platform-map.ts` honest.

### Security

Ownership is the concern, not secrecy. `ZERNIO_API_KEY` is one master key shared across every LYRA workspace, so the query params Zernio appends to its redirect are not tenant-scoped on their own. The callback therefore applies the same verification the existing Zernio callback does: authenticate the user, confirm their access to the target workspace, then confirm the returned account actually belongs to that workspace's own server-looked-up `zernioProfileId` before storing anything. Without that check, a forged `workspaceId` or `accountId` could link another tenant's channel.

---

## 3. Data model

```prisma
enum ChannelType {
  SLACK
  TEAMS   // reserved; no formatter in this build
}

model NotificationChannel {
  id                  String      @id @default(cuid())
  workspaceId         String      @unique   // one channel per workspace
  workspace           Workspace   @relation(fields: [workspaceId], references: [id])
  type                ChannelType
  zernioAccountId     String      // one Zernio account = one Slack channel
  label               String?     // e.g. "#client-acme-alerts"
  enabledEvents       String[]
  lastDeliveryAt      DateTime?
  lastDeliveryError   String?
  consecutiveFailures Int         @default(0)
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
}
```

`@@unique` on `workspaceId` enforces one-channel-per-workspace at the database level rather than in route logic. Relaxing it later is an index change, not a restructure.

`enabledEvents` is `String[]` validated against a canonical TypeScript list rather than a Prisma enum — adding an event should not require a migration.

`zernioAccountId` is stored in plaintext deliberately: it is an opaque identifier, not a credential. The bearer secret is `ZERNIO_API_KEY` in env. Encrypting an id that is useless without the master key would be theatre.

### Approval SLA fields

```prisma
model PostApproval {
  // ...existing
  submittedAt  DateTime?   // start of the CURRENT pending cycle
  slaAlertedAt DateTime?   // once-only fired flag; cleared on resubmit
}

model Workspace {
  // ...existing
  approvalSlaHours            Int @default(4)   // hours before scheduledAt
  approvalSlaUnscheduledHours Int @default(24)  // hours since submission, no scheduledAt
}
```

**Why `submittedAt` and not `createdAt`.** `app/api/posts/[id]/route.ts` upserts `PostApproval` on every approval transition, keyed on the unique `postId`. On resubmission the update branch runs — `createdAt` still holds the *first ever* submission. A post submitted in June, rejected, edited and resubmitted today would read as months overdue the instant it re-entered approval. `submittedAt` is stamped on every transition into `PENDING`, in both the create and update branches, and `slaAlertedAt` is cleared alongside it so a resubmitted post can alert again.

---

## 4. Notification delivery

### Event catalogue — `services/notifications/events.ts`

| Key | Trigger site | Default |
|---|---|---|
| `CRISIS_DETECTED` | `services/ai/crisis-detector.ts`, after the existing email | On |
| `POST_FAILED` | `workers/post-publisher.worker.ts`, on terminal failure | On |
| `POST_PENDING_APPROVAL` | `app/api/posts/[id]/route.ts`, PENDING_APPROVAL branch | On |
| `APPROVAL_SLA_BREACH` | `app/api/cron/check-approval-slas` | On |
| `POST_PUBLISHED` | `workers/post-publisher.worker.ts`, on success | Off |

`AI_RESPONSE_SENT` from the scope doc is omitted — it is default-off, explicitly flagged as noisy, and has no requester. Adding it later is one catalogue entry plus one trigger call.

### Flow

Trigger site calls `notifyChannel(workspaceId, event)`. That function resolves the workspace's channel, checks plan access and the per-event toggle, and enqueues a BullMQ job on a new `notification-delivery` queue. The worker formats the message and sends it through `zernioClient.sendSlackMessage`.

Delivery reuses Zernio's `x-request-id` idempotency layer with a stable key derived from the event and its subject, exactly as `publishNow` does. This codebase has already been bitten once, live, by a client-side timeout on a Zernio call causing a BullMQ retry to send a second real message — the same failure mode would double-post an alert.

**Everything is fail-open.** A notification failure must never affect crisis detection, publishing, or an approval transition — the same rule the crisis email already follows. `notifyChannel` never throws; it catches and logs.

Queueing rather than inline POST matches the established convention for outbound HTTP and gives retry-with-backoff for free. Trigger sites in serverless routes enqueue only.

### Health tracking

Each delivery updates `lastDeliveryAt` / `lastDeliveryError` / `consecutiveFailures`. The Settings panel surfaces a warning once `consecutiveFailures` crosses a threshold. Email remains the baseline path for crisis regardless, so a dead channel is never the only alert route.

### Formatter seam

`buildMessage(input)` produces one platform-neutral `ChannelMessage` (title, lines, link URL, link label). `formatSlackMessage(msg)` renders that to Slack mrkdwn plus the `platformSpecificData` identity override. A future `formatTeamsMessage` renders the same `ChannelMessage` to an Adaptive Card.

Message copy follows the CLAUDE.md voice rules — no emoji, no exclamation marks, one idea per sentence — rather than the scope doc §5 table's emoji-per-event styling, which was documentation shorthand rather than product copy.

---

## 5. Approval SLA tracking

The genuinely new feature. There is no existing notion of an approval deadline in LYRA.

### Rule

For each post in `PENDING_APPROVAL` whose approval has not already alerted:

- **Has `scheduledAt`:** breached when `now >= scheduledAt - approvalSlaHours`.
- **No `scheduledAt`:** breached when `now >= submittedAt + approvalSlaUnscheduledHours`.

A post already past its `scheduledAt` and still unapproved is breached by the first rule and alerts once, not repeatedly.

### Detection

New `app/api/cron/check-approval-slas/route.ts`, following the established cron pattern: `checkCronAuth`, query, enqueue, return a count. Only workspaces with approvals actually in use are scanned.

Once-only firing is enforced by setting `slaAlertedAt` in the same query pass, so a re-run cannot double-fire.

> **Manual step required.** This needs a cron-job.org entry pointing at the new route. It will not run otherwise. The handover records four of five existing cron jobs silently auto-disabling once before, so this is a real operational dependency, not a formality. Hourly is sufficient given a 4-hour default threshold.

### In-app indicator

An "Approval overdue" badge on the calendar post-preview card and the post detail panel, reusing the existing "Awaiting media" badge pattern. Derived at render time from the same rule, not from `slaAlertedAt` — the badge should reflect current reality even if the cron has not run yet, and should clear the moment the post is approved.

---

## 6. Plan gating

The required expression — `AGENCY || (PRO && agency.crisisAwareSubId)` — is exactly the `hasCrisisAware` check currently inlined in the settings page. Rather than copy it, both move to `lib/plan-access.ts`:

```ts
hasCrisisAwareAccess(plan, crisisAwareSubId): boolean
hasNotificationChannelAccess(plan, crisisAwareSubId): boolean
```

Two named exports that currently agree, for the same reason `APPROVER_ROLES` is kept separate from `canWrite` in `lib/authz.ts`: they answer different product questions and will diverge if pricing changes. The settings page is refactored to call the shared helper so frontend and backend cannot drift.

Enforced server-side on every channel route, not only in the UI.

---

## 7. Files

**New**
- `lib/plan-access.ts`
- `services/notifications/events.ts`
- `services/notifications/message.ts` (+ test) — platform-neutral message builder
- `services/notifications/slack-formatter.ts` (+ test)
- `services/notifications/channel-notifier.ts` (+ test)
- `services/notifications/approval-sla.ts` (+ test) — pure breach-rule helper, shared by cron and UI
- `workers/notification.worker.ts`
- `app/api/notification-channels/connect/route.ts` — starts Zernio OAuth
- `app/api/notification-channels/callback/route.ts` — verifies ownership, stores the channel
- `app/api/notification-channels/route.ts` — GET current
- `app/api/notification-channels/[id]/route.ts` — PATCH toggles, DELETE disconnect
- `app/api/notification-channels/[id]/test/route.ts`
- `app/api/cron/check-approval-slas/route.ts`
- `components/lyra/settings/notifications-section.tsx`

**Modified**
- `prisma/schema.prisma`
- `lib/queues.ts` — add `notificationQueue`
- `services/social/zernio-client.ts` — add `sendSlackMessage`
- `workers/index.ts` — register the worker
- `services/ai/crisis-detector.ts` — trigger
- `workers/post-publisher.worker.ts` — two triggers
- `app/api/posts/[id]/route.ts` — trigger, plus `submittedAt` / `slaAlertedAt` stamping
- `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — mount panel, use shared gate
- `components/lyra/calendar/post-preview-card.tsx` — overdue badge
- post detail panel — overdue badge

---

## 8. Out of scope

- Microsoft Teams formatter and setup guide
- Weekly digest event — blocked on Wishlist item 6
- Multiple channels per workspace, or event-to-channel routing
- Per-post SLA overrides
- Help-doc pages for Slack setup — follows once the feature is confirmed live
