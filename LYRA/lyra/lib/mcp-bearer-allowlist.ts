// Exact set of main-app API routes the LYRA MCP gateway (LYRA/lyra-mcp) legitimately
// calls with a bearer token, derived from every callLyraApi/postLyraApi/deleteLyraApi
// call site in lyra-mcp -- the fixed-path tool calls (src/tools/*.ts, src/audit-log.ts,
// src/get-workspace-name.ts, src/resolve-workspace-id.ts, src/capabilities/plan-tier.ts)
// plus every endpoint in src/capabilities/registry.ts (dispatched generically by
// src/tools/call-capability.ts) -- as of 2026-08-14. middleware.ts rejects a
// bearer-authenticated request to any other route before it reaches a route handler.
// This closes the gap where an MCP OAuth token functioned as a full-privilege account
// API key against the entire REST surface, not just the routes the gateway actually
// uses (part of finding H-1 in .full-review/05-final-report.md, 2026-08-13).
//
// Keep this in sync with lyra-mcp/src/lyra-api-client.ts call sites and
// lyra-mcp/src/capabilities/registry.ts endpoints when either changes.
interface AllowedRoute {
  method: 'GET' | 'POST' | 'DELETE'
  pattern: RegExp
}

// Converts a route template ('/api/workspaces/:id') into a regex anchored to the full
// pathname, with `:param` segments matching any single path segment.
function toPattern(path: string): RegExp {
  const escaped = path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${escaped}$`)
}

const ROUTES: Array<{ method: AllowedRoute['method']; path: string }> = [
  { method: 'GET', path: '/api/workspaces' },
  { method: 'GET', path: '/api/workspaces/:id' },
  { method: 'POST', path: '/api/upload/from-url' },
  { method: 'POST', path: '/api/upload/media-presign' },
  { method: 'POST', path: '/api/ai/score-content' },
  { method: 'GET', path: '/api/posts' },
  { method: 'POST', path: '/api/posts' },
  { method: 'GET', path: '/api/analytics' },
  { method: 'GET', path: '/api/brand-intelligence/profile' },
  { method: 'GET', path: '/api/comments/unread-count' },
  { method: 'GET', path: '/api/comments' },
  { method: 'GET', path: '/api/crisis/status' },
  { method: 'GET', path: '/api/trends' },
  { method: 'POST', path: '/api/mcp/audit' },
  { method: 'POST', path: '/api/mcp/respond-to-item' },
  { method: 'GET', path: '/api/competitors' },
  { method: 'POST', path: '/api/competitors' },
  { method: 'DELETE', path: '/api/competitors/:id' },
  { method: 'GET', path: '/api/seo/gsc-data' },
  { method: 'GET', path: '/api/seo/pages' },
  { method: 'POST', path: '/api/seo/pages' },
  { method: 'POST', path: '/api/seo/pages/:pageId/analyze' },
  { method: 'POST', path: '/api/seo/pages/:pageId/generate' },
  { method: 'POST', path: '/api/brand-intelligence/analyze-engagement' },
  { method: 'POST', path: '/api/brand-intelligence/build' },
  { method: 'POST', path: '/api/brand-intelligence/crisis-keywords/approve' },
  { method: 'POST', path: '/api/brand-intelligence/crisis-keywords/dismiss' },
  { method: 'DELETE', path: '/api/guardrails/:id' },
  { method: 'GET', path: '/api/email-campaigns' },
  { method: 'POST', path: '/api/schedule/generate' },
]

const ALLOWED_ROUTES: AllowedRoute[] = ROUTES.map((r) => ({ method: r.method, pattern: toPattern(r.path) }))

// /api/cron/* authenticates via a static CRON_SECRET compared as an
// `Authorization: Bearer <secret>` header (see checkCronAuth in lib/auth.ts) -- an
// entirely different mechanism from the Auth0-issued bearer JWTs this allowlist
// governs. Excluded here (rather than added to ALLOWED_ROUTES) so cron routes keep
// authenticating exactly as before, via their own existing check.
const EXEMPT_PREFIXES = ['/api/cron/']

export function isRestrictedBearerRoute(pathname: string): boolean {
  return pathname.startsWith('/api/') && !EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function isAllowedBearerRoute(method: string, pathname: string): boolean {
  return ALLOWED_ROUTES.some((route) => route.method === method && route.pattern.test(pathname))
}
