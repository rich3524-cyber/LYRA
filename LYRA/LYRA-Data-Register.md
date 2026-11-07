# LYRA — Data Classification and Retention Register

**Purpose:** Data inventory, classification, retention and erasure reference. Satisfies the
data classification and retention register requirement of the ITWM Custom Website Security
Framework v3.1 at Tier C.

**Codebase state this document describes:** `main` @ `ab35dee` (2026-11-07)

**Companion documents:** `LYRA-Permissions-Matrix.md` (who may reach what),
`LYRA-Security.md` (controls), `LYRA-Handover.md` (operational history).

---

## 1. Scope and method

Derived by enumerating all 28 models in `prisma/schema.prisma`, every `encrypt()` call site,
every `deleteMany` call site, and every S3 helper call site. Classification is assigned per
field group, not per model, because several models mix classifications.

**Read §5 first if you are looking for gaps.** Retention is the weakest area of this
register, and §5 says so plainly rather than describing an intended state.

---

## 2. Classification scheme

| Class | Definition | Handling requirement |
|---|---|---|
| **C1 — Secret** | Credentials for third-party systems. Compromise grants an attacker control of a customer's social presence or marketing systems | Encrypted at rest (AES-256-GCM), never logged, never returned in an API response |
| **C2 — Personal** | Identifies a natural person — LYRA's own users, or third parties whose comments LYRA ingests | Access-controlled, in scope for erasure requests |
| **C3 — Commercial confidential** | Customer business data with no personal identifier. Brand strategy, metrics, competitor analysis | Access-controlled, workspace-scoped |
| **C4 — Operational** | System state with no personal or secret content | Access-controlled, no special handling |
| **C5 — Public** | Already public on the originating platform, or intentionally public | No restriction |

---

## 3. Register

### 3.1 C1 — Secret

| Model.field | Contents | Encrypted at rest | Write path |
|---|---|---|---|
| `SocialAccount.accessToken` | Platform OAuth access token | ✓ | `services/social/oauth-connect.ts`, `social/facebook/complete` |
| `SocialAccount.refreshToken` | Platform OAuth refresh token | ✓ | as above |
| `SeoConnection.accessToken` | Google Search Console access token | ✓ | `api/seo/callback`, refreshed in `api/seo/gsc-data` |
| `SeoConnection.refreshToken` | Google Search Console refresh token | ✓ | `api/seo/callback` |
| `EmailIntegration.apiKey` | Klaviyo / Mailchimp / Customer.io API key | ✓ **with a caveat — see §5.4** | `api/email-integrations` |
| `OnboardingToken.token` | Bearer secret in a client-facing URL | — stored as issued | `uuid()`, 122 bits CSPRNG |

`OnboardingToken.token` is deliberately not encrypted: it is looked up *by* its value, so it
must be stored in a queryable form. Its defence is entropy plus a 7-day expiry plus per-token
rate limiting, documented in the schema. See `LYRA-Permissions-Matrix.md` §6.5 for its one
known weakness.

**Not in the database at all:** `ZERNIO_API_KEY`, `CRON_SECRET`, `ENCRYPTION_KEY`,
`OAUTH_STATE_SECRET`, Stripe keys, Auth0 secrets, AWS credentials, Anthropic key. All live in
environment variables on Netlify and Railway. `NotificationChannel` holds a Zernio account id,
not a credential — the bearer secret is the shared env key — and the schema says so.

### 3.2 C2 — Personal

| Model.field | Data subject | Source |
|---|---|---|
| `User.email`, `.name`, `.avatarUrl`, `.auth0Id` | LYRA's own user | Auth0 profile at login |
| `Comment.authorName`, `.authorHandle`, `.content` | **A member of the public** | Ingested from the social platform |
| `Review.authorName`, `.content` | **A member of the public** | Ingested from the platform |
| `CommentResponse.content` | Mentions the above by implication | AI-generated or human-written |
| `SocialAccount.accountName`, `.avatarUrl`, `.handle` | The customer's brand identity | Platform profile |
| `Agency.stripeCustomerId`, `Workspace.stripeCustomerId` | Billing identity (pointer, not card data) | Stripe |
| `McpAuditLog.userId`, `.params` | LYRA's own user | MCP tool invocations |

**`Comment` and `Review` are the register's most significant entries**, and the reason this
document exists at Tier C rather than Tier B. They hold personal data about people who are
**not** LYRA customers, who never agreed to anything with LYRA, and who cannot log in to see
or correct it. Their content is also fed into Claude prompts to generate public replies. An
erasure or access request from one of these people cannot currently be served by any
self-service path — see §5.3.

No card numbers, no bank details, no government identifiers, no health data, and no
passwords are stored anywhere. Authentication is delegated entirely to Auth0; payment data
entirely to Stripe. Neither ever touches LYRA's database.

### 3.3 C3 — Commercial confidential

| Model | Contents |
|---|---|
| `BrandProfile` | Voice summary, tone, audience, brand intelligence output. Interpolated into AI prompts |
| `Guardrail` | What the AI must never say or must escalate — reveals a customer's sensitivities |
| `Post`, `PostApproval` | Unpublished content, scheduling, approval history |
| `PostMetrics`, `PostBoost` | Performance and ad spend |
| `Competitor`, `CompetitorSnapshot` | Who the customer watches and their benchmarks |
| `CrisisEvent` | Reputational incidents |
| `SeoPage`, `SeoContent`, `SearchConsoleData` | Search strategy and performance |
| `EmailCampaign` | Email marketing performance |
| `Workspace.*` settings | Autonomy level, client access level, SLA configuration |

`Guardrail` and `CrisisEvent` deserve particular care: a competitor reading either would learn
exactly where a brand believes itself vulnerable.

### 3.4 C4 — Operational

`ProcessedWebhookEvent` (Stripe idempotency ledger), `WorkspaceAccess` (role grants),
`FacebookPending` (in-flight OAuth state), `SocialAccount.lastCommentSyncAt` /
`.lastCommentSyncError`, all `createdAt` / `updatedAt` timestamps.

### 3.5 C5 — Public

`Comment.content` and `Review.content` are already public on the originating platform, and
`CommentResponse` content becomes public once posted. They are still classified **C2 above**,
not C5: already-public-elsewhere is not a licence to retain indefinitely, re-publish, or feed
into an AI system without limit. Genuinely C5: `/api/health`, the marketing site, and the
cached help PDF.

---

## 4. Processors and data location

Every third party that receives LYRA data. A full vendor security assessment is a separate
Phase 1 artefact; this is the inventory it will work from.

| Processor | Receives | Classification |
|---|---|---|
| Supabase (PostgreSQL) | Everything in §3 | C1–C4 |
| Netlify | App hosting; request logs | C2 incidental |
| Railway | Worker fleet; worker logs | C2 incidental |
| Upstash (Redis) | BullMQ job payloads — ids, not content | C4 |
| Auth0 | Identity, email, authentication | C2 |
| Stripe | Billing identity and payment data | C2 |
| Anthropic (Claude) | Brand profiles, guardrails, post content, **ingested public comments** | C2, C3 |
| Zernio | Social API intermediary — posts, comments, tokens | C1, C2, C3 |
| AWS S3 | Brand guideline documents, media, logos, cached help PDF | C2, C3 |
| Klaviyo / Mailchimp / Customer.io | Email marketing, per customer's own integration | C2 |
| Google (Search Console) | Search performance, per customer's own connection | C3 |
| cron-job.org | Scheduling triggers only — no payload | none |

Social tokens pass through Zernio as an intermediary. That custody question was examined
separately in `lyra/docs/investigations/2026-08-24-zernio-token-custody-findings.md`.

---

## 5. Retention and erasure — current state

This section states what the code does, not what a policy would prefer.

### 5.1 There is no retention schedule, and no purge job

`deleteMany` appears in exactly three places in the whole codebase: `DELETE /api/account`,
`DELETE /api/workspaces/[id]`, and `DELETE /api/posts/[id]`. There is no scheduled purge in
`app/api/cron/*` and none in `workers/*`.

**Every record in §3 is therefore retained indefinitely until a human deletes its parent.**
That includes `Comment` and `Review` rows about members of the public, which accumulate for
as long as an account exists and are never aged out.

This is the register's principal gap. Closing it means a decision per model — a retention
period for ingested third-party comments is a policy question, not an engineering one — and
then one cron route. The decision is the hard part and it has not been made.

### 5.2 Erasure deletes database rows but leaves S3 objects

`DELETE /api/account` destroys owned workspaces and all 14 of their non-cascading child
models in one transaction, removes the user's access rows to workspaces they merely share
(correctly — deleting your account must not destroy a workspace others use), cancels live
Stripe subscriptions, and deletes the `User` row. `DELETE /api/workspaces/[id]` does the
workspace-scoped equivalent.

Neither touches S3. `deleteObject` (`lib/s3.ts:27`) has exactly **one** call site in the
entire codebase: `DELETE /api/brand-intelligence/guidelines`. So uploaded brand guideline
documents, media assets and workspace logos survive account deletion indefinitely as
orphaned objects with no database row pointing at them.

They are not publicly readable, and the database row that named the key is gone, so this is a
retention failure rather than an exposure. It is still an incomplete erasure and should be
stated as such to any customer who asks.

### 5.3 No erasure path exists for ingested third-party personal data

A member of the public whose comment LYRA ingested has no way to request access or erasure.
They have no account, there is no public-facing request mechanism, and no operator tooling
exists to find and delete one person's comments across workspaces. Satisfying such a request
today means a manual SQL statement.

Given LYRA's premise — AI replying publicly on a brand's behalf to comments from the
public — this is the register's most material compliance gap after §5.1, and the two are the
same decision: how long may a third party's comment be retained, and how is it removed on
request.

### 5.4 One field self-heals its encryption, and only when active

`EmailIntegration.apiKey` was stored in plaintext before it was brought in line with the
other credential fields. `services/email-marketing/sync.ts:14` handles this by attempting
`decrypt()`, treating any failure as "never encrypted", using the raw value and re-encrypting
the row. The reasoning is sound: `decrypt()` throws on any value it did not itself produce,
so there is no ambiguous case.

The limitation is that the migration is **lazy**. A row only self-heals on its next sync, so
an integration with `isActive: false` keeps a plaintext API key indefinitely. A one-off
migration pass over every row, active or not, would close it. Until then, assume at least one
plaintext third-party API key may exist in the table.

### 5.5 Fixed in this review: deletion was failing outright for some customers

`NotificationChannel` references `Workspace` with no `onDelete` rule and was missing from
**both** deletion transactions. Any workspace with a Slack alert channel connected therefore
threw a foreign-key violation on the final `workspace.delete`, and both routes answered 500.

Account and workspace deletion were simply broken for those customers — an erasure blocker,
not a cosmetic bug. This is the second occurrence of the same fault: the three SEO models
caused it first, and the comments recording that fix are directly above the line
`NotificationChannel` should have been added to. Both transactions now delete it, and a test
asserts the **whole** set of non-cascading children, naming any model that is missed, so a
third occurrence fails in CI rather than in production.

---

## 6. Recommended next decisions

In the order they should be taken. Each is a decision first and a small amount of code
second.

1. **Set a retention period for `Comment` and `Review`.** This unblocks both §5.1 and §5.3.
   It is a policy call about third-party personal data; engineering cannot pick it.
2. **Decide the retention period for `McpAuditLog`**, which grows per tool call and has no
   ceiling.
3. **Add S3 deletion to both erasure paths** (§5.2), or an S3 lifecycle rule as a backstop.
   Purely mechanical once someone decides which.
4. **Run the one-off `EmailIntegration.apiKey` encryption pass** (§5.4), then delete the lazy
   fallback so a plaintext key becomes an error rather than a self-healing condition.
5. **Publish a data subject request route** for non-customers (§5.3), even if the first
   version is an email address in the privacy policy plus a documented operator runbook.

---

## 7. Re-deriving this document

Run from `lyra/`.

```bash
# Models
grep -n "^model " prisma/schema.prisma

# Credential fields and whether each write path encrypts
grep -rn "encrypt(" app/ services/ workers/ --include=*.ts | grep -v "\.test\.\|decrypt("

# Every deletion path in the codebase. Three call sites is the current answer;
# more means a retention job was added and §5.1 is stale.
grep -rn "deleteMany" app/ services/ workers/ lib/ --include=*.ts | grep -v "\.test\."

# S3 object deletion. One call site is the current answer; §5.2 is stale if more.
grep -rn "deleteObject" app/ services/ workers/ --include=*.ts | grep -v "\.test\."

# Workspace children WITHOUT a cascade rule -- every one of these must appear in
# both deletion transactions or the route 500s on an FK violation.
# Returns 10 at ab35dee, matching the 10 explicit deletes in each transaction
# (4 of the 14 deletes target children of Post or Comment, not of Workspace).
grep -nE "workspace +Workspace +@relation" prisma/schema.prisma | grep -v Cascade
```
