# LYRA — Permissions Matrix

**Purpose:** Authorisation reference and audit artefact. Satisfies the permissions-matrix
requirement of the ITWM Custom Website Security Framework v3.1 (mandatory at Tier C, which
LYRA is classified as).

**Codebase state this document describes:** `main` @ `ab35dee` (2026-11-07)

**Companion documents:** `LYRA-Security.md` (controls, transport, secrets, webhook security),
`LYRA-Handover.md` (operational history).

---

## 1. How this document was produced

This is not a design document written from intent. Every statement below was derived by
enumerating the actual route handlers and reading the authorisation predicate in each one.

- 57 route files export at least one mutating method (`POST` / `PATCH` / `PUT` / `DELETE`).
- 35 route files export `GET`.
- Each was bucketed by the authentication it performs and the role predicate it applies.

Where this document and the code disagree, the code is correct and this document is stale.
Re-derive it with the census commands in §7 after any change to the API surface.

---

## 2. Principals

### 2.1 Human principals (`UserRole` in `prisma/schema.prisma`)

A user's role is **not** a global property. It is an attribute of `WorkspaceAccess`, a row
joining one user to one workspace. The same person can hold a different role in every
workspace they can reach, and holds no role at all in workspaces they cannot.

| Role | Intended holder | Distinct authority |
|---|---|---|
| `AGENCY_ADMIN` | Agency owner / account holder | Full: content, settings, integrations, deletion |
| `AGENCY_MEMBER` | Agency staff member | Content and approvals; **not** workspace settings |
| `SMB_OWNER` | Self-serve single-business customer | Same as `AGENCY_ADMIN` within their workspace |
| `CLIENT_APPROVE` | Agency's end client, approval rights | Read plus approve/reject posts |
| `CLIENT_VIEW` | Agency's end client, read-only | Read only — the one role `canWrite` denies |
| `PLATFORM_OWNER` | (LYRA operator) | **None distinct.** See §6.1 |

### 2.2 Non-human principals

| Principal | Authenticates via | Reaches |
|---|---|---|
| Scheduler (cron-job.org plus Railway `cron-*` services) | `Authorization: Bearer <CRON_SECRET>`, compared with `timingSafeEqual` after a byte-length guard (`checkCronAuth`, `lib/auth.ts:103`) | `/api/cron/*` only |
| Stripe | Stripe signature verification (`stripe.webhooks.constructEvent`) | `POST /api/stripe/webhook` |
| Zernio | Payload signature verification | `POST /api/zernio/webhook` |
| LYRA MCP gateway | Auth0-issued bearer JWT resolving to **a specific user** (`getUserFromBearerToken`) | A 30-entry route allowlist, enforced in `middleware.ts` before any handler runs (`lib/mcp-bearer-allowlist.ts`) |
| Onboarding client (pre-account) | Opaque high-entropy token in the URL, no session | `GET` / `PATCH /api/onboarding` only |
| Anonymous public | Nothing | `POST /api/klaviyo/subscribe`, `POST /api/oauth/register`, `GET /api/health`, `GET /api/help/pdf` |

A bearer token carries **the role of the user it resolves to**. It is not a privilege
escalation path: it narrows the reachable route set, and the per-route role predicate still
applies on top of it.

---

## 3. The authorisation model

There is **no global administrator and no tenant-bypass path anywhere in the codebase.**
Every authorisation decision is a workspace-scoped database predicate, not an in-memory check
on an already-fetched object. The canonical shape is:

```ts
where: { id, access: { some: { userId: user.id, role: <policy> } } }
```

Fetching and authorising in one query is deliberate: it means an unauthorised object is never
in scope for a later edit to act on.

Three named policies, all in `lib/authz.ts`:

| Policy | Members | Semantics |
|---|---|---|
| `canWrite(role)` | everyone except `CLIENT_VIEW` | **Deny-one.** A new `UserRole` gets write access automatically unless added to the exclusion |
| `APPROVER_ROLES` | all except `CLIENT_VIEW` | **Allow-listed.** A new `UserRole` gets nothing until added deliberately |
| `OWNER_ROLES` | `AGENCY_ADMIN`, `SMB_OWNER` | **Allow-listed.** Workspace settings, deletion, workspace-level integrations |

`canWrite` and `APPROVER_ROLES` currently agree on membership and are still kept separate on
purpose: they have opposite failure modes when `UserRole` grows, and for an approval gate
fail-closed is the property that matters.

### 3.1 The second axis: `Workspace.clientAccessLevel`

Role answers *"what may this user do?"*. `clientAccessLevel` (`NONE` | `VIEW` | `APPROVE`)
answers *"what is this workspace configured to expose to client-role users at all?"* It is a
per-workspace switch set by an owner, and it decides whether a created post lands as `DRAFT`
or `PENDING_APPROVAL` (`resolveCreateStatus`, `app/api/posts/route.ts:179`). Both axes must
pass.

---

## 4. Matrix: resource × role

`✓` permitted · `—` denied · `R` read only

| Resource / action | AGENCY_ADMIN | SMB_OWNER | AGENCY_MEMBER | CLIENT_APPROVE | CLIENT_VIEW | Policy |
|---|---|---|---|---|---|---|
| **Workspace** | | | | | | |
| View workspace | ✓ | ✓ | ✓ | ✓ | ✓ | membership |
| Create workspace | ✓ | ✓ | ✓ | ✓ | ✓ | authenticated plus plan limit (§6.3) |
| Change settings (`PATCH`) | ✓ | ✓ | — | — | — | `OWNER_ROLES` |
| Delete workspace | ✓ | ✓ | — | — | — | `OWNER_ROLES` |
| Generate client onboarding link | ✓ | — | ✓ | — | — | explicit list (§6.2) |
| Bulk import posts | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| **Content** | | | | | | |
| View posts / calendar | R | R | R | R | R | membership |
| Create / edit / delete post | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Approve / reject post | ✓ | ✓ | ✓ | ✓ | — | `APPROVER_ROLES` |
| Publish now | ✓ | ✓ | ✓ | ✓ | — | inline `role: { not: 'CLIENT_VIEW' }` |
| Boost post (spends ad budget) | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Upload media | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| **Engagement** | | | | | | |
| View comments / reviews | R | R | R | R | R | membership |
| Reply publicly as the brand | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Change comment / review status | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Trigger comment sync | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| **AI** | | | | | | |
| Generate caption / response / score | ✓ | ✓ | ✓ | ✓ | — | `canWrite` plus rate limit |
| Build / refresh brand profile | ✓ | ✓ | ✓ | ✓ | — | `canWrite` plus rate limit |
| Upload brand guideline document | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Approve / dismiss crisis keyword | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Resolve a crisis | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Delete a guardrail | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| **Integrations** | | | | | | |
| Connect / disconnect social account | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Connect Google Search Console | ✓ | ✓ | ✓ | ✓ | — | `canWrite` (§6.4) |
| Connect / delete / test alert channel | ✓ | ✓ | — | — | — | `OWNER_ROLES` |
| Connect / delete email integration | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Add / delete competitor | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| **Commercial** | | | | | | |
| Start Stripe checkout | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Delete own account | ✓ | ✓ | ✓ | ✓ | ✓ | self; `OWNER_ROLES` decides workspace disposition |
| **Reporting** | | | | | | |
| View analytics | R | R | R | R | R | membership |
| Trigger analytics sync | ✓ | ✓ | ✓ | ✓ | — | `canWrite` |
| Generate PDF report | ✓ | ✓ | ✓ | ✓ | — | `canWrite` plus rate limit |

`PLATFORM_OWNER` is omitted from the table: it behaves exactly as `AGENCY_MEMBER` (see §6.1).

### 4.1 Cross-tenant

| Action | Permitted by any role | Mechanism |
|---|---|---|
| Read another workspace's data | **No** | Every read predicate includes `access: { some: { userId } }` |
| Write to another workspace | **No** | Same predicate on every mutating route |
| Act on an object by guessing its id | **No** | Object lookups are scoped in the same query, not checked after fetch |
| Attach own OAuth credentials to another workspace | **No** | Signed OAuth `state` plus a re-check of workspace access in every callback |

---

## 5. Non-human principal matrix

| Route group | Scheduler | Stripe | Zernio | MCP bearer | Onboarding token | Anonymous |
|---|---|---|---|---|---|---|
| `/api/cron/*` | ✓ | — | — | exempt from the allowlist, still needs `CRON_SECRET` | — | — |
| `/api/stripe/webhook` | — | ✓ signature | — | — | — | — |
| `/api/zernio/webhook` | — | — | ✓ signature | — | — | — |
| 30 allowlisted app routes | — | — | — | ✓ as the resolved user; role predicate still applies | — | — |
| every other `/api/*` | — | — | — | **403 at middleware** | — | — |
| `/api/onboarding` (`GET`, `PATCH`) | — | — | — | — | ✓ | — |
| `/api/klaviyo/subscribe` | — | — | — | — | — | ✓ rate-limited |
| `/api/oauth/register` | — | — | — | — | — | ✓ rate-limited, RFC 7591 |
| `/api/health` | — | — | — | — | — | ✓ by design |

---

## 6. Findings and deliberate asymmetries

### 6.1 `PLATFORM_OWNER` carries no distinct authority

`PLATFORM_OWNER` appears in exactly **one** place in the entire codebase: the `APPROVER_ROLES`
list. It is absent from `OWNER_ROLES`, and no code path anywhere grants it cross-workspace or
cross-tenant access. Its effective privileges are identical to `AGENCY_MEMBER`.

This is the **safe** outcome — there is no superuser account to compromise — but the name
implies authority the role does not have. Treat it as a reserved enum value, not an operator
role. Giving it meaning later is a design decision requiring its own threat review, not a
one-line addition to `OWNER_ROLES`.

### 6.2 `SMB_OWNER` cannot generate an onboarding link for its own workspace

`POST /api/onboarding` gates on `['AGENCY_ADMIN', 'AGENCY_MEMBER']` rather than on
`OWNER_ROLES` or `canWrite`. An `SMB_OWNER` is therefore locked out of the guided social
connect flow for the workspace they own. This reads as a product gap rather than a security
finding — the guided flow is an agency-to-client handoff — but it is an inconsistency, and if
`SMB_OWNER` should have it, that is a one-line change to that route's role list.

### 6.3 Workspace creation is intentionally role-free

`POST /api/workspaces` requires only authentication, because it creates a workspace nobody
previously had access to and then makes the caller its `AGENCY_ADMIN`. There is no
pre-existing role to check. Abuse is bounded by the plan workspace limit enforced in that
route (`PLANS[agency.plan].workspaces`), not by a role.

### 6.4 Fixed in this review: the Google Search Console connection was writable by `CLIENT_VIEW`

`GET /api/seo/callback` verified that the caller had *some* access to the workspace named in
the signed OAuth state, but never checked the **role**. `GET /api/seo/connect` applied no
access check at all, so nothing upstream gated it either. A read-only `CLIENT_VIEW` client
could therefore repoint a workspace's Search Console property at one they control, and
overwrite the stored Google refresh token for everyone else in that workspace.

Not cross-tenant — workspace membership was still required — and the two sibling OAuth
callbacks (`zernio/connect/callback`, `notification-channels/callback`) already guarded
against exactly this, the Zernio one with a comment spelling out the reasoning. The SEO
callback was the one that did not. Both sides now apply `canWrite`, covered by 11 tests.

### 6.5 `PATCH /api/onboarding` remains usable after completion

The onboarding token is accepted until `expiresAt` (7 days) regardless of `completedAt`, so a
leaked or forwarded onboarding URL can be replayed to overwrite `websiteUrl`, `industry` and
`brandProfile.voiceSummary` after the client has finished. It is rate-limited per-IP **and**
per-token, and `voiceSummary` is length-bounded and fenced against prompt injection, so the
blast radius is small. Deliberately not changed here: rejecting a completed token alters a
live customer-facing flow and is a product decision, not an audit sweep.

### 6.6 Resolved in this review: `OWNER_ROLES` was duplicated six times

`['AGENCY_ADMIN', 'SMB_OWNER']` was hand-declared as a local `const` in six separate route
files. This is the precise pattern behind the 2026-11 self-comment incident, where three
hand-rolled copies of one filter drifted and LYRA publicly replied to its own sibling brand.
It is now a single export in `lib/authz.ts` alongside `canWrite` and `APPROVER_ROLES`.

---

## 7. Re-deriving this document

Run from `lyra/`. This is the exact census behind §1.

```bash
# Every mutating route, with the authentication and role predicate it applies.
for f in $(grep -rl -E "export async function (POST|PATCH|PUT|DELETE)" app/api --include=route.ts); do
  flags=""
  grep -q "requireAuth\|getCurrentUser" "$f" && flags="$flags AUTH" || flags="$flags noauth"
  grep -q "checkCronAuth" "$f" && flags="$flags CRON"
  grep -q "CLIENT_VIEW\|canWrite\|APPROVER_ROLES\|OWNER_ROLES" "$f" && flags="$flags ROLE" || flags="$flags norole"
  echo "$flags ${f#app/api/}"
done | sort
```

Two rules for reading the output. Anything not on the lists below is a finding.

**`noauth` is acceptable only for these six routes:**

| Route | Why |
|---|---|
| `POST /api/stripe/webhook` | Stripe signature verification |
| `POST /api/zernio/webhook` | Zernio signature verification |
| `POST /api/klaviyo/subscribe` | Public newsletter form, rate-limited per IP |
| `POST /api/oauth/register` | RFC 7591 dynamic client registration — by definition pre-credential. Rate-limited per IP |
| `POST /api/trends/refresh` | 503 stub, unreleased feature, no implementation behind it |
| `PATCH /api/trends/[id]/status` | 503 stub, as above |

**`AUTH norole` is acceptable only for these three routes:**

| Route | Why |
|---|---|
| `POST` / `PATCH /api/onboarding` | `POST` gates on its own stricter role list; `PATCH` is token-authenticated (§6.2, §2.2) |
| `POST /api/workspaces` | No pre-existing role to check; bounded by plan limit (§6.3) |
| `POST /api/stripe/trend-checkout` | 503 stub, unreleased feature |

A new route appearing in either bucket means either the role check was forgotten or this
document needs a new row justifying it. There is no third possibility.
