// Small typed accessor for the Auth0 `sub` claim carried through
// AuthInfo.extra (set by requireBearerAuth in http.ts). extra is typed as
// Record<string, unknown>, so every consumer would otherwise have to narrow
// it inline -- a plausible mistake there (e.g. blindly String()-coercing a
// missing sub) would silently produce the literal string "undefined", which
// combined with the rate limiter's `ratelimit:mcp:user:${key}` key format
// would create ONE shared rate-limit bucket for every affected user.
// Centralizing the narrowing here makes that specific mistake impossible for
// callers that use this helper -- though it only narrows the type; it does
// NOT paper over a missing sub with a fallback value. The one real caller
// (mcp-server.ts's tool-call wrapper) treats a null return as fatal and
// throws, rather than falling back to a shared placeholder key, since a
// silent fallback would recreate the exact bucket-collision problem this
// helper exists to prevent.
//
// Lives in its own module (not http.ts, where it originated) because http.ts
// already imports createLyraMcpServer from mcp-server.ts. If mcp-server.ts
// also imported this helper from http.ts, the two files would import from
// each other -- a circular module dependency. Putting the shared piece in
// a third, dependency-free module keeps both http.ts (the producer, via
// requireBearerAuth setting extra.sub) and mcp-server.ts (the consumer)
// as one-directional imports.
export function getAuthSub(authInfo?: { extra?: Record<string, unknown> }): string | null {
  const sub = authInfo?.extra?.sub
  return typeof sub === 'string' && sub ? sub : null
}
