import express, { type Request, type Response, type NextFunction } from 'express'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { verifyAuth0AccessToken } from './jwt-verify'

// @modelcontextprotocol/server and @modelcontextprotocol/node type req.auth
// structurally (e.g. `NodeIncomingMessageLike { auth?: AuthInfo }` in
// @modelcontextprotocol/node's toNodeHandler.d.ts) rather than augmenting
// Express's own Request type globally -- neither package's .d.mts files
// contain a `declare global` or `declare module 'express'` block. So we add
// our own augmentation here, using the SDK's real exported `AuthInfo` type
// (confirmed against its installed types) rather than redeclaring the shape
// ourselves.
declare global {
  namespace Express {
    interface Request {
      auth?: AuthInfo
    }
  }
}

const SCOPES_SUPPORTED = [
  'openid', 'profile', 'email',
  'workspaces:read', 'content:read', 'content:write',
  'inbox:respond', 'settings:write', 'reports:read',
]

function wwwAuthenticateHeader(): string {
  const appBaseUrl = process.env.APP_BASE_URL
  return `Bearer resource_metadata="${appBaseUrl}/.well-known/oauth-protected-resource"`
}

export async function requireBearerAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.setHeader('WWW-Authenticate', wwwAuthenticateHeader())
    return res.status(401).json({ error: 'unauthorized', error_description: 'Missing bearer token' })
  }

  const token = authHeader.slice('Bearer '.length)
  const payload = await verifyAuth0AccessToken(token)
  if (!payload) {
    res.setHeader('WWW-Authenticate', wwwAuthenticateHeader())
    return res.status(401).json({ error: 'invalid_token', error_description: 'Token verification failed' })
  }

  // req.auth is read by toNodeHandler (a later task) and forwarded as
  // pass-through auth context into every tool callback's ctx.http.authInfo
  // -- confirmed against the SDK's real installed types.
  req.auth = {
    token,
    clientId: typeof payload.azp === 'string' ? payload.azp : '',
    scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
  }
  next()
}

function protectedResourceMetadataHandler(_req: Request, res: Response) {
  const appBaseUrl = process.env.APP_BASE_URL
  res.status(200).json({
    resource: `${appBaseUrl}/mcp`,
    // Points at the RFC 8414 document LYRA's own app serves (Phase 0,
    // docs/LYRA-mcp-server-design.md §2.2) -- this is where the
    // registration_endpoint (the DCR shim) and Auth0's real
    // authorize/token endpoints are discoverable, not Auth0's raw
    // domain directly (Auth0 doesn't serve LYRA's DCR-aware metadata
    // document itself).
    authorization_servers: ['https://lyraonline.ai'],
    bearer_methods_supported: ['header'],
    scopes_supported: SCOPES_SUPPORTED,
  })
}

export function createApp() {
  const app = express()

  app.get('/health', (_req, res) => res.status(200).json({ ok: true }))

  // RFC 9728 §3.1 technically requires this document to live at a
  // resource-scoped well-known path (host + '/.well-known/oauth-protected-resource'
  // + the resource's own path, i.e. '/mcp' here) so clients can compute the
  // URL proactively without ever hitting a 401 first. The MCP spec's actual
  // discovery flow doesn't need that -- clients read `resource_metadata`
  // verbatim off the `WWW-Authenticate` header of a 401 -- but we serve both
  // so spec-strict proactive-discovery clients aren't left 404ing, alongside
  // the bare root path some clients/tooling default to.
  app.get('/.well-known/oauth-protected-resource', protectedResourceMetadataHandler)
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadataHandler)

  // express.json() is scoped to just /mcp (not applied globally) so that a
  // malformed JSON body on an unauthenticated request can't reach
  // body-parser's default (non-JSON) error handler before requireBearerAuth
  // gets a chance to reject it with the same {error, error_description}
  // shape every other failure path here uses. /health and the metadata
  // routes above never need a parsed body.
  app.post('/mcp', express.json(), requireBearerAuth)
  // A later task mounts the actual MCP protocol handler on this same route,
  // after this middleware, replacing this bare `requireBearerAuth`-only
  // registration.

  return app
}
