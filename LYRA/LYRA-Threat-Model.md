# LYRA — Threat Model (STRIDE)

**Status: DRAFT for human review.** Derived from the code, the permissions matrix and the
data register. A threat model is a judgement exercise, not a derivation — the asset list,
boundaries and attack paths below are grounded in what the code actually does, but the
**risk ratings and the accept/mitigate decisions are proposals and need an owner's sign-off.**
Nothing here should be read as a decision already taken.

**Purpose:** Satisfies the STRIDE threat model requirement of the ITWM Custom Website
Security Framework v3.1 at Tier C, once reviewed.

**Codebase state:** `main` @ `09a124a` (2026-11-07)

**Inputs:** `LYRA-Permissions-Matrix.md` (principals, boundaries),
`LYRA-Data-Register.md` (assets, flows, processors), `LYRA-Control-Verification.md`
(controls and gaps).

---

## 1. What makes LYRA's threat model unusual

Most SaaS threat models are about protecting the customer's data from other customers. Two
things make LYRA different, and both deserve more attention than the generic categories:

1. **LYRA speaks publicly as the customer, autonomously.** The product's point of
   difference is that AI replies to comments and reviews on a brand's behalf, 24/7, with no
   human in the loop at `Autonomy: FULL`. The worst realistic outcome is not data
   exfiltration — it is LYRA posting something damaging under a client's name to that
   client's audience. That is a **reputational integrity** threat, it is externally visible
   and un-deletable in practice, and it has already happened once in a benign form (the
   sibling-brand self-reply, 2026-11).

2. **Untrusted third-party text is a primary input to an AI that holds credentials.**
   Ingested comments are written by anyone on the internet, are stored, and are fed into
   Claude prompts whose output is published. That is a textbook indirect prompt-injection
   channel, and the attacker needs no account — just the ability to comment on a public post.

Everything in §4 is ordered with those two first.

---

## 2. Assets

| Asset | Why an attacker wants it | Class |
|---|---|---|
| **Social access tokens** (`SocialAccount`) | Full control of a brand's social presence, independent of LYRA | C1 |
| **The brand's public voice** | Post or reply as a trusted brand to its own audience | — |
| Google Search Console tokens (`SeoConnection`) | Search data; a foothold in the customer's Google account | C1 |
| Email marketing API keys (`EmailIntegration`) | Send as the brand to its subscriber list | C1 |
| `ENCRYPTION_KEY` | Decrypts every credential above, for every tenant at once | C1 |
| `CRON_SECRET` | Trigger every scheduled job arbitrarily | C1 |
| `ZERNIO_API_KEY` | One master key across **all** tenants — see §4.1 | C1 |
| Brand profiles and guardrails | Reveals exactly where a brand believes itself vulnerable | C3 |
| Unpublished content and calendar | Competitive intelligence; pre-announcement leakage | C3 |
| Ingested comments and reviews | Personal data about non-customers | C2 |
| Onboarding tokens | Pre-authentication write access to a workspace | C1 |

---

## 3. Trust boundaries

```
                    ┌──────────────────── the public internet ────────────────────┐
                    │  anonymous visitors · commenters on a brand's posts         │
                    └──────────┬──────────────────────────┬───────────────────────┘
                               │ (B1)                     │ (B2) ingested comment text
                    ┌──────────▼──────────┐               │
                    │  Auth0 (identity)   │               │
                    └──────────┬──────────┘               │
                               │ (B3) session / bearer    │
        ┌──────────────────────▼──────────────────────────▼──────────────────┐
        │  Next.js app on Netlify                                            │
        │  per-route authn + authz · Zod · rate limits                       │
        │  ── (B4) workspace boundary: every query scoped by WorkspaceAccess │
        └───┬────────────┬────────────┬───────────────┬───────────────┬──────┘
            │ (B5)       │ (B6)       │ (B7)          │ (B8)          │ (B9)
      ┌─────▼─────┐ ┌────▼─────┐ ┌────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
      │ Supabase  │ │ Upstash  │ │ Anthropic │ │   Zernio    │ │   AWS S3    │
      │ Postgres  │ │  Redis   │ │  (Claude) │ │ (social API)│ │  media/docs │
      └───────────┘ └────┬─────┘ └───────────┘ └──────┬──────┘ └─────────────┘
                         │ (B10)                      │ (B11)
                  ┌──────▼──────────┐          ┌──────▼────────────────┐
                  │ Railway workers │          │ Facebook · Instagram  │
                  │  (BullMQ fleet) │          │ LinkedIn · GBP · etc. │
                  └─────────────────┘          └───────────────────────┘
```

The boundary that matters most is **B4**, the workspace boundary, and the permissions matrix
establishes it is enforced as a database predicate on every route rather than as an
in-memory check — there is no global administrator anywhere to bypass it.

**B2 is the boundary most easily overlooked.** Comment text crosses from the open internet
into an AI prompt whose output is published, without any account ever being created.

---

## 4. STRIDE analysis

Proposed severity. **Open** = no control; **Partial** = control exists with a known gap;
**Mitigated** = control verified in `LYRA-Control-Verification.md`.

### 4.1 Spoofing

| # | Threat | Severity | State |
|---|---|---|---|
| S1 | **Zernio's single master key spans every tenant.** `ZERNIO_API_KEY` is one key for all workspaces, so Zernio's redirect query parameters are not tenant-scoped on their own | **High** | **Mitigated** — `zernio/connect/callback` verifies the returned `accountId` belongs to *this* workspace's Zernio profile before trusting it, and the code says why. Keep that check; it is the only thing making the shared key safe |
| S2 | Credential stuffing / account takeover | Medium | **Mitigated** — delegated to Auth0; no password stored by LYRA |
| S3 | Session hijack then privileged action | **High** | **Partial** — authorisation is correct, but no step-up re-auth (control 03 gap). A stolen session can delete a tenant |
| S4 | Onboarding token guessed or replayed | Medium | **Partial** — 122-bit entropy, 7-day expiry, per-IP *and* per-token rate limits. Gap: the token still works after `completedAt` |
| S5 | Forged webhook | Medium | **Mitigated** — Stripe and Zernio signatures verified; Stripe redelivery deduplicated via `ProcessedWebhookEvent` |
| S6 | MCP bearer token used as a general API key | **High** | **Mitigated** — `middleware.ts` confines bearer auth to a 30-route allowlist before any handler runs, and the token still carries only its user's role |

### 4.2 Tampering

| # | Threat | Severity | State |
|---|---|---|---|
| T1 | **Indirect prompt injection via an ingested comment** — a commenter writes instructions, Claude obeys them, LYRA publishes the result as the brand | **High** | **Partial** — untrusted text is fenced in named tags and `neutralizeFenceCloser` prevents fence-escape; guardrails and `maxAiRepliesPerThread` bound the damage. No defence is complete; at `Autonomy: FULL` there is no human gate. **This is the threat to re-test first** |
| T2 | Cross-tenant write | **High** | **Mitigated** — every mutating route scopes by `WorkspaceAccess`; all 57 enumerated |
| T3 | Read-only client escalating to write | Medium | **Mitigated** — `canWrite` denies `CLIENT_VIEW`; one real instance of this found and fixed in the SEO OAuth callback during the control-04 review |
| T4 | SQL injection | **High** if present | **Mitigated** — three raw-SQL uses, all parameterised or literal |
| T5 | Mass assignment via a route body | Medium | **Mitigated** — Zod schemas map to explicit fields |
| T6 | Malicious upload executed or parsed unsafely | Medium | **Partial** — MIME allowlist, S3-enforced size limits, generated names. No magic-byte check, no malware scanning (control 05 gap) |
| T7 | Dependency or CI compromise | **High** | **Partial** — blocking CI, read-only token, Dependabot, SHA-pinned gitleaks, CODEOWNERS. No SAST or dependency-vulnerability gate |

### 4.3 Repudiation

| # | Threat | Severity | State |
|---|---|---|---|
| R1 | **"LYRA posted that, not us" — or the reverse — cannot be settled** | Medium | **Partial** — `McpAuditLog` covers MCP tool use and `CommentResponse` records replies, but there is no general audit trail of who changed what. For an autonomous product this is also a *customer-protection* gap: a client disputing a published reply should be answerable from a log |
| R2 | Security events unobservable after the fact | Medium | **Partial** — no log aggregation, no retention (control 15 gap). Demonstrated concretely: 19,833 log lines dropped in one burst during the comment-ingestion outage, including the only diagnostic line |

### 4.4 Information disclosure

| # | Threat | Severity | State |
|---|---|---|---|
| I1 | Cross-tenant read | **High** | **Mitigated** — scoped predicates on all reads |
| I2 | **`ENCRYPTION_KEY` compromise decrypts every tenant's credentials at once** | **Critical** | **Open by design** — single key, no per-tenant derivation, no KMS. Accepting this needs to be explicit, and the cryptographic-use inventory (control 10 gap) is where it belongs |
| I3 | Objects readable in the public S3 bucket | Medium | **Partial** — `media/` must be public for the platforms to fetch it; keys are `randomUUID`. Guideline keys hardened this review. **Operator must confirm the policy grants read to `media/*`, not the bucket** |
| I4 | SSRF reaching cloud metadata or internal services | **High** | **Mitigated** — `safeFetch` is thorough: https-only, A+AAAA blocklisting, IPv4-mapped and NAT64 normalisation, address pinning against DNS rebinding, per-hop redirect re-validation, credential-header stripping across origins, response-size cap |
| I5 | Error messages leaking internals | Medium | **Mitigated** — generic responses throughout; `upload/from-url` explicitly refuses to echo `safeFetch` errors, which would otherwise be an internal-network reconnaissance oracle |
| I6 | Brand profile or guardrails leaked to a competitor | Medium | **Mitigated** at the boundary (I1), but note these are the highest-value C3 assets |
| I7 | Third-party personal data retained indefinitely with no erasure path | Medium | **Open** — no retention schedule, no purge job, no DSR route for non-customers (data register §5.1, §5.3) |

### 4.5 Denial of service

| # | Threat | Severity | State |
|---|---|---|---|
| D1 | AI cost amplification | Medium | **Partial** — per-user rate limits on all five AI routes; **no global spend ceiling** (control 21 gap), so cost scales with user count |
| D2 | Upload or fetch memory exhaustion | Medium | **Mitigated** — S3-enforced upload limits; `safeFetch` response cap added this review |
| D3 | XLSX decompression bomb | Low | **Open** — 10MB upload cap and a row cap, but the row cap is applied *after* exceljs expands the archive. Bounded by function memory; availability only |
| D4 | Redis or queue exhaustion | Medium | **Partial** — tick-window job IDs prevent unbounded duplicate enqueues. The 2026-11 outage showed a retry storm can itself sustain an outage |
| D5 | Silent pipeline failure (worse than an outage) | **High** | **Partial** — this is the failure mode LYRA actually experienced: comment ingestion dead for two months while every dashboard read healthy. `lastCommentSyncAt`/`lastCommentSyncError` now exist; **cron-job.org notifications are still off** |

### 4.6 Elevation of privilege

| # | Threat | Severity | State |
|---|---|---|---|
| E1 | `CLIENT_VIEW` → write | Medium | **Mitigated** — `canWrite` on every mutating route; one real instance found and fixed this review |
| E2 | `AGENCY_MEMBER` → workspace owner | Medium | **Mitigated** — `OWNER_ROLES` on settings, deletion and alert channels, now centralised in `lib/authz.ts` |
| E3 | Any authenticated user → another tenant | **High** | **Mitigated** — no code path grants cross-workspace access; `PLATFORM_OWNER` holds no authority beyond `APPROVER_ROLES` |
| E4 | **AI tool misuse escalating to a published action** | **High** | **Partial** — MCP tools are allowlisted, workspace-scoped and role-checked server-side. But `POST /api/mcp/respond-to-item` publishes publicly, and at `Autonomy: FULL` no human approves. Overlaps T1 |
| E5 | Middleware bypass (CVE-2025-29927 class) | **High** | **Mitigated** — middleware is never the only check; every route authorises itself |

---

## 5. Proposed priorities

For the owner to confirm or re-order. Ranked by proposed risk, not by effort.

| Rank | Item | Threats | Why first |
|---|---|---|---|
| 1 | **Decide the `Autonomy: FULL` human-gate policy** | T1, E4 | The product's differentiator is also its largest threat. A published reply cannot be recalled. This is a product decision, not an engineering one, and nothing else should be built around it until it is made |
| 2 | **Re-test prompt injection end to end**, including via a comment that reaches a live autonomous reply | T1, E4 | Fencing is implemented well but unproven against the real path. Control 21's acceptance evidence requires recorded injection results |
| 3 | **Turn on cron-job.org failure notifications** | D5 | One checkbox per job. The cheapest item on this list, against the failure mode that has already cost two months of ingestion |
| 4 | **Decide `ENCRYPTION_KEY` strategy and write the key inventory** | I2 | A single key decrypting every tenant's credentials is either an accepted risk or it is not; today it is undocumented. Also captures that rotation without a re-encryption pass destroys all stored tokens |
| 5 | **Add step-up re-authentication** | S3 | The only outright control Gap. Auth0 supports it; the actions needing it are already enumerated in control 03 |
| 6 | **Set retention for `Comment`/`Review` and publish a DSR route** | I7 | Unblocks both open data-register items. Policy decision first |
| 7 | **Confirm the S3 bucket policy scope** | I3 | One console check that either closes the item or turns it into a real finding |
| 8 | **Add SAST and a dependency-vulnerability gate to CI** | T7 | Additive workflow jobs, no application change |
| 9 | **Global AI spend ceiling** | D1 | Small change, bounded blast radius, protects margin as well as availability |
| 10 | **Centralise logs with alerting on authn/authz failures** | R1, R2, D5 | Also the enabler for R1's audit-trail gap |

---

## 6. Explicitly out of scope

Stated so a reviewer knows these were considered and excluded, not missed.

- **Auth0, Stripe, Supabase, Netlify, Railway internal compromise** — processor risk, handled
  by the vendor assessment (the outstanding Phase 1 artefact), not by application controls.
- **Social platform compromise** (B11) — LYRA cannot mitigate Meta or LinkedIn being breached.
- **Physical and endpoint security** — control 17, process rather than code.
- **The customer's own Google/Meta account security** — outside LYRA's boundary, though note
  I3 and the SEO token path mean a LYRA compromise is a *foothold* toward them.

---

## 7. Review log

| Date | Reviewer | Change |
|---|---|---|
| 2026-11-07 | Claude Opus 5 (draft) | Initial draft from the permissions matrix, data register and control verification register |
| | *(pending)* | **Owner review required: confirm asset list, severity ratings and the §5 ordering, and record accept/mitigate decisions for I2, I7 and the §5.1 autonomy policy** |
