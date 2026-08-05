# lyra-mcp

MCP gateway for LYRA. Exposes read-only core tools over streamable HTTP at `/mcp`, authenticated via Auth0-issued bearer tokens (see `docs/LYRA-mcp-server-design.md` and `docs/superpowers/specs/2026-08-04-mcp-gateway-phase1-design.md` in the main `lyra` app for full design context).

## Development

```bash
npm install
cp .env.example .env.local   # fill in AUTH0_DOMAIN, AUTH0_MCP_AUDIENCE, LYRA_API_BASE_URL
npm run dev
```

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
