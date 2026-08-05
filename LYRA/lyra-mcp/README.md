# lyra-mcp

MCP gateway for LYRA. Exposes 10 core tools (7 read, 3 write) over streamable HTTP at `/mcp`, authenticated via Auth0-issued bearer tokens (see `docs/LYRA-mcp-server-design.md`, `docs/superpowers/specs/2026-08-04-mcp-gateway-phase1-design.md`, and `docs/superpowers/specs/2026-08-05-mcp-gateway-phase2-design.md` in the main `lyra` app for full design context).

**Tools:** `list_workspaces`, `get_workspace_overview`, `get_brand_profile`, `list_scheduled_posts`, `get_analytics`, `list_inbox_items`, `list_trends` (read); `draft_post`, `schedule_post`, `respond_to_item` (write — see `src/mcp-server.ts`'s `TOOL_REGISTRY` for exact descriptions/schemas). Every tool call is rate-limited (per-user and per-workspace) and audit-logged via `POST /api/mcp/audit` in the main app.

## Development

```bash
npm install
cp .env.example .env.local   # fill in every var below except PORT (Railway sets that automatically)
npm run dev
```

`src/index.ts` fails fast at startup if any required var is missing — see `REQUIRED_ENV_VARS` there for the current list.

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
