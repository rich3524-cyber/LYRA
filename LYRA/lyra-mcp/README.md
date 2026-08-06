# lyra-mcp

MCP gateway for LYRA. Exposes 12 core tools (7 read, 3 write, 2 capability-discovery) over streamable HTTP at `/mcp`, authenticated via Auth0-issued bearer tokens (see `docs/LYRA-mcp-server-design.md`, `docs/superpowers/specs/2026-08-04-mcp-gateway-phase1-design.md`, `docs/superpowers/specs/2026-08-05-mcp-gateway-phase2-design.md`, and the Phase 3 spec in the main `lyra` app for full design context).

**Tools:** `list_workspaces`, `get_workspace_overview`, `get_brand_profile`, `list_scheduled_posts`, `get_analytics`, `list_inbox_items`, `list_trends` (read); `draft_post`, `schedule_post`, `respond_to_item` (write); `search_capabilities`, `call_capability` (capability discovery/invocation — see `src/mcp-server.ts`'s `TOOL_REGISTRY` for exact descriptions/schemas). Every tool call is rate-limited (per-user and per-workspace) and audit-logged via `POST /api/mcp/audit` in the main app.

`call_capability` gives generic access to 15 additional capabilities beyond the 12 core tools — things like competitor tracking, SEO tools, brand intelligence, and email campaign visibility. Use `search_capabilities` to find the right one by name or keyword; see `src/capabilities/registry.ts`'s `CAPABILITY_REGISTRY` for the full list.

**Prompts:** 4 guided entry points are registered for MCP clients that support prompts — `plan_next_week`, `triage_inbox`, `summarise_client_performance`, `turn_trend_into_post` (see `src/prompts.ts`'s `PROMPT_REGISTRY` for the exact starting messages).

## Development

```bash
npm install
cp .env.example .env.local   # fill in every var below except PORT (Railway sets that automatically)
npm run dev
```

`src/index.ts` fails fast at startup if any required var is missing — see `REQUIRED_ENV_VARS` there for the current list.

## Tool-selection eval

```bash
npm run eval
```

Dev-only harness (`scripts/tool-selection-eval.ts` + `scripts/eval-cases.ts`) that measures whether the real Claude API picks the right tool for ~30 realistic prompts against this gateway's tool descriptions. It needs `ANTHROPIC_API_KEY` set in the environment and makes real, paid API calls — it's never run by the deployed gateway itself. Some cases are two-turn (checking that Claude calls `search_capabilities` before `call_capability`), so a full run can make up to ~45 API calls. Target: 90%+ correct tool selection.

## Environment variables

| Variable | Purpose |
|---|---|
| `AUTH0_DOMAIN` | Same Auth0 tenant as the main LYRA app — used to fetch the JWKS for bearer token verification |
| `AUTH0_MCP_AUDIENCE` | Must match the main app's value — the audience this gateway's tokens are validated against |
| `LYRA_API_BASE_URL` | Base URL of the LYRA API this gateway forwards calls to (e.g. `https://lyraonline.ai`) |
| `APP_BASE_URL` | This gateway's own public base URL (e.g. `https://mcp.lyraonline.ai`) — used in the RFC 9728 metadata document |
| `PORT` | HTTP port (Railway sets this automatically in production) |
| `REDIS_URL` | Same Redis instance the main LYRA app's Railway worker fleet uses — backs gateway-side rate limiting |

## Deployment

Deployed as its own Railway service (`lyra-mcp`), Root Directory set to `LYRA/lyra-mcp`, via Railway's native GitHub integration — no custom CI deploy step. Domain: `mcp.lyraonline.ai`, bound in the Railway dashboard.
