# LYRA MCP Gateway — Phase 2 Design Spec

**Date:** 2026-08-05
**Status:** Approved
**Parent spec:** `docs/LYRA-mcp-server-design.md` (Phase 2 of the rollout table in section 8)

---

## Overview

Phase 1 (complete, deployed, dogfooded via a real Claude conversation against the ITWM workspace) built the `lyra-mcp` gateway and its 7 read-only core tools. Phase 2 adds the 3 write tools the parent spec's core tool surface calls for — `draft_post`, `schedule_post`, `respond_to_item` — plus the approval-workflow integration and audit logging their write behavior depends on, and the gateway-side rate limiting the parent spec's security section requires before writes go live.

**Exit criteria (unchanged from the parent spec):** beta with a small group of waitlist agencies.

**Explicitly out of scope for Phase 2** (per the parent spec's rollout table and this session's scoping decisions):
- The capability registry (`search_capabilities`, `call_capability`), long-tail capabilities, MCP prompts — all Phase 3
- Tool-selection evals (30-prompt suite) — tied to registry growth per the parent spec, deferred to Phase 3 same as last time
- A client-facing audit-trail UI — backend logging only for Phase 2 (explicit scoping decision this session); a UI surface is a real future addition once there's real audit data to design against
- Connector directory submission — Phase 4

---

## 1. Write tools & the backend gaps they close

All three tools are gateway-side `(params, bearerToken) => result` functions, matching Phase 1's established shape — but two of them require real, non-trivial additions to the main LYRA app first, found by auditing what already exists rather than assuming.

### `draft_post`
Pure composition, no backend gap: calls the existing six-dimension content-scoring endpoint (`POST /api/ai/score-content`) and the existing post-create endpoint (`POST /api/posts`, status `DRAFT`), returns both. Score is informational, not gating — the post is always created regardless of score.

### `schedule_post`
**Real gap closed:** today, nothing server-side decides whether a scheduled post needs approval before publishing — that logic exists only in a UI component (`getNextStatuses`, used to build the calendar's status-transition menu), never enforced by any API route. `POST /api/posts` cannot even create a post directly into `PENDING_APPROVAL` (`ALLOWED_CREATE_STATUSES` only permits `DRAFT`/`SCHEDULED`).

Fix: add server-side approval-status resolution directly into the main app's post-create path. When a workspace's `clientAccessLevel` requires approval and the calling user's role isn't an approver role, the post is created straight into `PENDING_APPROVAL` in one atomic call — not created as `DRAFT`/`SCHEDULED` and then separately `PATCH`ed, which would leave the post in the wrong state if the second call ever failed partway. The MCP tool itself stays a thin wrapper around this now-correct create path.

### `respond_to_item`
**Real gap closed:** workspace autonomy mode (`Off` / `Draft+Approve` / `Full`) is currently read and acted on in exactly one place — `workers/comment-monitor.worker.ts`, triggered only by the inbound comment-sync background job. Neither of the two existing synchronous routes this tool needs (`POST /api/ai/respond` for drafting, `POST /api/comments/[id]/reply` for sending) checks autonomy mode at all; both are mode-agnostic by construction.

Design: `respond_to_item` always drafts first — generating via AI (respecting guardrails, already safely callable synchronously via `generateCommentResponse`) if no response text is supplied. What happens next is driven purely by the workspace's own `aiResponseMode`, never by a parameter the calling LLM passes:
- **Off / Draft+Approve** → stops at the draft. Returns the draft text and says so explicitly (matching the parent spec's "truthful write results" convention).
- **Full** → proceeds to actually send.

This keeps the safety property automatic and workspace-configuration-driven rather than trusting the calling model to ask correctly, and matches the parent spec §3.4's literal language ("Under Off or Draft+Approve, `respond_to_item` produces a draft and says so").

---

## 2. Guardrails — closing the send-path gap

`generateCommentResponse` (the existing guardrail-enforcing draft generator: pre-generation `ALWAYS_ESCALATE` scan, prompt-embedded `NEVER_DISCUSS`/`NEVER_USE_WORD`/`APPROVED_ANSWER` rules with untrusted-content framing, post-generation re-check of the model's own output) is already proven safe to call synchronously — it's used today by both the async worker and the existing `POST /api/ai/respond` route.

**Real gap closed:** the send route (`POST /api/comments/[id]/reply`) accepts and sends whatever text it's given, with zero guardrail check of its own. That's fine for the existing web-app flow (a human already reviewed the draft before clicking send), but `respond_to_item`'s Full-autonomy auto-send path skips that human review entirely.

Fix: before `respond_to_item` calls the send route, it re-runs the post-generation half of `generateCommentResponse`'s checks (`NEVER_USE_WORD`/`NEVER_DISCUSS`) against whatever text is about to be sent — whether that's the just-generated draft or an already-stored `aiDraftResponse`. If a guardrail fires at this stage, the tool returns a structured refusal (parent spec §5: naming the rule that fired, e.g. `Never Discuss: pricing`) instead of sending, and the comment stays in its drafted state rather than silently failing.

---

## 3. Audit logging

New Prisma model, following the `CrisisEvent` precedent (append-only, workspace-scoped, indexed) rather than the upsert/inline-field pattern used for post approvals and comment state — the codebase's only other candidate patterns are both current-state trackers, not history logs, and audit logging needs history.

```
McpAuditLog {
  id, workspaceId, userId, toolName, params (Json), outcome (SUCCESS | ERROR | REFUSED),
  errorMessage (nullable), createdAt
}
```

The gateway adds one outbound header on every call to the LYRA API — `X-LYRA-MCP-Tool: <tool_name>` — so the main app knows which tool triggered the request without the gateway needing any logging logic or database access of its own (keeping it stateless, per the Phase 0/1 principle that the gateway is a pure pass-through, never a privileged actor). The main app's existing bearer-auth path (`lib/auth.ts`, `getUserFromBearerToken`) writes one audit row per bearer-authenticated request that carries this header, capturing the already-resolved user/workspace, the tool name from the header, a redacted param summary, and the outcome.

Backend-only for Phase 2, per this session's scoping decision — the data is captured and queryable, but no UI is built to view it yet.

---

## 4. Rate limiting

Per this session's scoping decision: built now, matching the parent spec's §6.4 requirement exactly, rather than deferred past Phase 2's beta.

New `ioredis` dependency in the gateway (currently has zero Redis/shared-state connection — confirmed via direct inspection of `lyra-mcp/package.json` and a source grep, not assumed). Reuses the same `REDIS_URL` the main app's existing Railway Redis instance already exposes — one shared instance, not a second one to provision. Ports the main app's proven fixed-window Lua-script limiter (`lib/rate-limit.ts` — atomic `INCR`+`EXPIRE` in one round-trip, specifically avoiding the crash-between-two-commands TTL bug its own comment documents) into the gateway as its own small module. Can't be imported directly since `lyra-mcp` is a fully separate Node package from the Next.js app, but the pattern is proven and cheap to replicate.

Applied per-user and per-workspace on every tool call — reads and writes both, per the parent spec, not just the new write tools. Exact limit/window numbers are an implementation-plan detail, not a design decision to fix here; they should be generous enough not to interfere with normal single-user-at-a-time conversational use.

---

## 5. Testing

Same three-layer approach as Phase 1:

- **Protocol conformance** — MCP Inspector against the deployed gateway, now exercising the 3 write tools too (with a disposable test post/comment, not real client data).
- **Contract tests** — gateway against the LYRA API, covering: permission enforcement (role gating — agency-side get writes, client-side get read+approve, per parent spec §3.4), guardrail blocks (both the draft-time and the new send-time check), approval routing (workspace `clientAccessLevel` correctly resolving initial post status), and rate-limit rejection shapes.
- **Tool-selection evals** — still deferred to Phase 3, tied to registry growth per the parent spec.

---

## Self-Review

**Spec coverage:** every section of the parent spec's Phase 2 scope (rollout table: "Writes, approval integration, audit logging") is addressed — the 3 write tools (§1), the guardrail send-path gap they surface (§2), audit logging (§3), and rate limiting (§4, explicitly called out in the parent spec's §6.4 as belonging here). Role gating and guardrail-identity (parent spec §3.4) are carried forward into the design rather than re-litigated.

**Placeholder scan:** none — every design decision in this doc has a concrete resolution, including the two genuinely open scope questions from this session's brainstorm (rate-limiting timing, audit-log UI), both settled via explicit user decisions recorded in §3 and §4.

**Internal consistency:** the audit-logging design (§3) and the established Phase 0/1 "gateway holds no credentials, is a pure pass-through" principle are consistent — the gateway sends one identifying header, all logging logic and storage lives in the main app, exactly matching how bearer-token validation itself was split in Phase 0 (gateway does authentication, main app does authorization). The rate-limiting design (§4) follows the same shared-Redis-instance, ported-not-imported pattern already established by the audit-logging design's header-based approach to cross-package concerns.

**Ambiguity check:** `respond_to_item`'s send/draft-only behavior is driven entirely by workspace configuration (`aiResponseMode`), explicitly not by a parameter the calling LLM supplies — called out directly in §1 to prevent a later implementer from adding a `send: boolean` param that would let a model talk its way around the workspace's own autonomy setting.
