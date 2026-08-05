# LYRA MCP Gateway — Phase 3 Design Spec

**Date:** 2026-08-06
**Status:** Approved
**Parent spec:** `docs/LYRA-mcp-server-design.md` (Phase 3 of the rollout table in section 8)

---

## Overview

Phase 1 (complete, deployed, dogfooded) built the gateway and its 7 core read tools. Phase 2 (complete, deployed, verified live) added the 3 core write tools (`draft_post`, `schedule_post`, `respond_to_item`), audit logging, and rate limiting. Phase 3 adds the last two core tools the parent spec's tool table already names — `search_capabilities` and `call_capability` — plus the capability registry infrastructure they depend on, a small set of MCP prompts, and the tool-selection eval the parent spec requires as this phase's exit bar.

**Exit criteria (per the parent spec's rollout table):** tool-selection eval at 90% or better.

**Explicitly out of scope for Phase 3:**
- Anything that sends a real message, spends real money, or destroys data — no post boosting (real Meta ad spend), no manual publish-now, no comment-reply capability beyond the existing core `respond_to_item` tool, no billing/Stripe, no account/workspace deletion. These are excluded from the capability registry entirely, not just deferred.
- Connector directory submission — Phase 4.
- LYRA Trend capabilities — the underlying feature is unshipped (all `trends/*` routes return `503` stubs), so there is nothing real to expose yet, despite `list_trends` already existing as a core tool name.
- Wiring the eval into CI — it costs real API calls and needs a key available in whatever environment runs it; nothing prevents adding this later once the pattern is proven, but it's a manual `npm run eval` for this phase.
- Team/workspace-member management — no invite/role-change/remove-member endpoints exist in the API yet, so there's nothing to register as a capability.

---

## 1. Capability registry — format and v1 scope

Every long-tail capability is one manifest entry, matching the parent spec's shape exactly:

```ts
interface CapabilityDefinition {
  name: string
  description: string
  endpoint: string
  method: 'GET' | 'POST'
  paramSchema: z.ZodTypeAny
  requiredScope: string
  minPlanTier: 'STARTER' | 'PRO' | 'AGENCY'
  mutates: boolean
  wrapsUntrustedContent?: boolean   // see section 3 — only set on capabilities returning third-party content
}
```

Manifest entries live in a static array in the gateway repo (`lyra-mcp/src/capabilities/registry.ts`), not a database — matching the parent spec's "ships with the code" framing for the gateway's persistent state. Adding a capability later is a pull request against this file, not a schema migration.

**V1 scope (13 capabilities, all read-only or low/medium-risk mutations, all pointing at existing, already-tested backend routes — no new backend work required):**

| Capability | Endpoint | Method | Mutates | Min plan |
|---|---|---|---|---|
| `list_competitors` | `GET /api/competitors` | GET | No | PRO |
| `add_competitor` | `POST /api/competitors` | POST | Yes | PRO |
| `remove_competitor` | `DELETE /api/competitors/[id]` | POST* | Yes | PRO |
| `get_seo_search_data` | `GET /api/seo/gsc-data` | GET | No | — |
| `list_seo_pages` | `GET /api/seo/pages` | GET | No | — |
| `analyze_seo_page` | `POST /api/seo/pages/[pageId]/analyze` | POST | Yes | — |
| `generate_seo_content` | `POST /api/seo/pages/[pageId]/generate` | POST | Yes | — |
| `analyze_engagement_patterns` | `POST /api/brand-intelligence/analyze-engagement` | POST | Yes | — |
| `rebuild_brand_profile` | `POST /api/brand-intelligence/build` | POST | Yes | — |
| `approve_crisis_keyword` | `POST /api/brand-intelligence/crisis-keywords/approve` | POST | Yes | — |
| `dismiss_crisis_keyword` | `POST /api/brand-intelligence/crisis-keywords/dismiss` | POST | Yes | — |
| `list_email_campaigns` | `GET /api/email-campaigns` | GET | No | — |
| `repurpose_content` | `POST /api/ai/repurpose` | POST | No† | — |
| `score_content` | `POST /api/ai/score-content` | POST | No | — |
| `generate_schedule` | `POST /api/schedule/generate` | POST | Yes | — |
| `generate_report` | `POST /api/reports/generate` | POST | Yes | PRO |

\* `call_capability`'s dispatcher only ever issues GET or POST per the manifest's `method` field (matching `callLyraApi`/`postLyraApi`'s existing signatures) — a capability backed by a `DELETE` route is registered with `method: 'POST'` in the manifest and the underlying route call still issues the real HTTP `DELETE`; the dispatcher's `method` field describes how the *gateway* forwards the call (query params vs. body), not literally which HTTP verb reaches the LYRA API. (Implementation detail to get right in the plan — flagging here so it isn't invented differently later.)

† `repurpose_content` returns drafts without persisting them, so it's `mutates: false` despite calling an AI generation endpoint — no state changes until a follow-up `draft_post` call.

Table is intentionally not exhaustive on every field (min plan tier blank = no explicit gate found in current code, meaning available on all tiers) — the implementation plan will need to verify each `minPlanTier` against the real route at build time, the same "ground in real code" discipline every prior phase used.

---

## 2. `search_capabilities` and `call_capability`

### `search_capabilities(query: string, workspace_id?: string)`

Keyword/substring match against each capability's `name` + `description` — no embeddings or semantic search infrastructure needed at 13 entries. When `workspace_id` is given (resolved the same way every other tool resolves it), each match is annotated:

```json
{ "name": "add_competitor", "description": "...", "available": true }
{ "name": "generate_report", "description": "...", "available": false, "requires": "PRO" }
```

Returns name + description + availability only — not the full schema — keeping the response small enough that Claude can scan several candidates before committing to one.

### `call_capability(name: string, params: unknown, workspace_id?: string)`

The one generic dispatcher, replacing what would otherwise be 13 hand-written tool functions:

1. Look up the manifest entry by `name`. Unknown name → clear structured error (not a silent no-op).
2. Validate `params` against that capability's `paramSchema`. Invalid params → the same structured validation error shape every other tool already uses.
3. If the capability's schema includes `workspace_id`, resolve it via the existing `resolveWorkspaceId` helper (implicit single-workspace resolution, explicit requirement on ambiguity — same behavior as every core tool), then check the resolved workspace's plan tier against `minPlanTier`. Insufficient tier → structured error naming the required tier, not a silent failure or generic 403.
4. Forward to the real endpoint via the existing `callLyraApi` (GET) / `postLyraApi` (POST) clients.
5. Shape the response per section 3 below, then return it.

Both tools are registered as two more entries in the existing `TOOL_REGISTRY` in `mcp-server.ts` — they go through the exact same rate-limiting and audit-logging wrapper (`createToolCallback`) every one of the 10 existing tools already uses. No new cross-cutting infrastructure.

---

## 3. Security conventions under generic dispatch

The parent spec's §6.1 (untrusted content) and §6.2 (workspace echo-back) conventions were designed around hand-written tools that can bake in exactly the right framing per response shape. Generic dispatch can't infer that per capability from just `{endpoint, method}` — this section is the plan for not silently losing those protections.

**§6.2 workspace echo-back.** Applied generically in `call_capability` itself: whenever the dispatched capability has `mutates: true`, the wrapper resolves and echoes the workspace name automatically, shaping the response as `{ workspaceName, result: <raw API response> }`. Same safety property as the core write tools (a misresolved workspace is visible immediately), applied once in the dispatcher rather than requiring every future capability addition to remember to do it.

**§6.1 untrusted third-party content.** Cannot be inferred generically — added as an explicit `wrapsUntrustedContent?: boolean` field on the manifest (extending the parent spec's literal registry shape by one field, a refinement found while grounding this design in the real capability list, same practice as every prior phase's plan-writing). Set `true` only where a capability genuinely returns third-party text: in the v1 list, that's `list_competitors` (a competitor's scraped public content carries the same prompt-injection risk class as a hostile comment or review). Every other v1 capability returns either the client's own content, structured metrics, or AI-generated output — not ingested third-party text — so the flag stays unset (default `false`) for the rest. When set, `call_capability` applies the same `wrapUntrusted` framing `list_inbox_items` already uses, generically, based on the flag rather than a hand-written per-capability wrap.

---

## 4. MCP prompts

The installed SDK (`@modelcontextprotocol/server` v2) supports `registerPrompt` alongside `registerTool` — confirmed against the real installed package before writing this spec, not assumed from the parent spec's description alone. Four prompts, matching the parent spec's list exactly:

1. **Plan next week's content for a workspace** — points toward `get_brand_profile` → `get_workspace_overview` → `draft_post`/`schedule_post`, with an explicit reminder to check brand voice before generating (mirroring `get_brand_profile`'s own "call before generating" tool description).
2. **Triage the inbox across all workspaces** — `list_workspaces` → `list_inbox_items` per workspace → `respond_to_item` where appropriate, respecting whatever autonomy mode each workspace has configured.
3. **Summarise last month's performance for a client** — `get_analytics`, optionally `get_seo_search_data`/`generate_report` from the new capabilities, synthesized into a narrative summary.
4. **Turn a trend into a scheduled post** — `list_trends` → `draft_post`/`schedule_post`, carrying the trend's brand-relevance context into the draft. (Note: `list_trends` itself still returns `available: false` per Phase 1's honest-unavailability design, since LYRA Trend is unshipped — this prompt is real infrastructure shipped ahead of the feature it assists, same as the tool it wraps.)

Each prompt is a name, description, and a templated starting message — no new backend work, gateway-side registration only.

---

## 5. Tool-selection eval

A checked-in script (`lyra-mcp/scripts/tool-selection-eval.ts`), ~30 realistic prompts spanning the 10 core tools and the 13 new capabilities (plus `search_capabilities`/`call_capability` themselves). For each prompt: call the real Claude API with the full tool list attached via the Anthropic SDK's `tools` parameter (the same shape the gateway itself exposes over MCP), capture the `tool_use` block Claude selects, score it — **tools are never actually executed**, this measures selection only.

**Scoring:** correct tool name is the baseline requirement. For prompts where a wrong parameter would produce a materially different real-world action (e.g. an ambiguous multi-workspace prompt where the wrong `workspace_id` matters), correct key parameters are also checked. A right-tool-wrong-param result is reported as a distinct, flagged category rather than silently counted as a pass — the 90% threshold should reflect genuinely correct behavior, not just "picked something plausible."

**Running it:** `npm run eval` in `lyra-mcp`, requires `ANTHROPIC_API_KEY` in the environment. Not wired into CI this phase (real API cost, needs a key present) — re-run manually whenever the registry changes, per the parent spec's explicit requirement. Output: pass/fail count plus a list of exactly which prompts failed and what was selected instead, so a regression is diagnosable without re-running everything by hand.

**Prompt authorship:** initial ~30 drafted from the tool/capability descriptions and realistic agency workflows during plan-writing, reviewed by Richard before being locked in as the baseline (he has direct visibility into what real users actually ask that a generic draft can't fully capture).

---

## 6. Testing and rollout

Same TDD discipline as every prior phase: unit tests for capability lookup, param validation, plan-tier gating, and the generic dispatch logic (mocked HTTP calls, matching the existing test patterns for `callLyraApi`/`postLyraApi`-based tools). `search_capabilities`/`call_capability` inherit the existing `createToolCallback` wrapper's rate-limiting/audit-logging test coverage by construction — no separate test infrastructure needed for that part.

**No new infrastructure.** No new database tables, no new environment variables, no new external services — every v1 capability points at an existing, already-deployed backend route. Lower deployment risk than Phase 2 (which needed a new audit table and Redis).

**Exit criteria:** tool-selection eval at 90%+ correct selection across the full prompt set, plus a manual MCP Inspector pass (matching Phases 1-2's precedent) exercising `search_capabilities`, `call_capability` against at least one gated (insufficient-tier) and one available capability, and at least one MCP prompt end-to-end — before calling this phase dogfood-ready.

---

## Self-Review

**Spec coverage:** every element of the parent spec's Phase 3 scope (registry, `search_capabilities`, `call_capability`, long-tail capabilities, MCP prompts, tool-selection eval at 90%) is addressed. The parent spec's manifest shape (§4.2) is implemented as specified, with one addition (`wrapsUntrustedContent`) explicitly called out as a refinement, not a silent deviation.

**Placeholder scan:** none — every design decision resolved to a concrete answer during the brainstorm, including the two genuinely open questions (dispatch architecture, eval mechanism) settled via explicit user decisions recorded in sections 2 and 5.

**Internal consistency:** the generic-dispatch model (section 2) and the security-convention design (section 3) are consistent — both explicitly reason about what a hand-written-per-tool convention loses under generic dispatch and compensate for it structurally (a manifest flag + dispatcher-level logic) rather than leaving a gap. The "no new infrastructure" claim in section 6 is consistent with every capability in section 1's table pointing at an already-existing route.

**Ambiguity check:** the `method` field's meaning (gateway-forwarding shape vs. literal underlying HTTP verb) was flagged explicitly in section 1's footnote specifically because it's the one place a future implementer could reasonably guess two different things — resolved there rather than left for the plan to discover ambiguously.
