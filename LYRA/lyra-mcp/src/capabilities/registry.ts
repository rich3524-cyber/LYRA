import { z } from 'zod'
import type { SCOPES_SUPPORTED } from '../http'

// Derived from http.ts's single source of truth for the scopes this gateway
// actually issues/accepts, so a typo like 'content:writes' fails to compile
// instead of silently producing a capability that fails closed at runtime.
type SupportedScope = (typeof SCOPES_SUPPORTED)[number]

export interface CapabilityDefinition {
  description: string
  endpoint: string
  method: 'GET' | 'POST' | 'DELETE'
  paramSchema: z.ZodTypeAny
  // Declarative only, as of this phase -- populated on every entry below and
  // carried through the JWT into the wrapper's auth context (see http.ts's
  // req.auth.scopes), but no code path in this gateway actually checks a
  // capability's requiredScope against the caller's granted scopes before
  // call_capability invokes it. Do not assume this field is a live
  // authorization control: an OAuth client that only consented to
  // content:read/content:write can currently invoke a settings:write
  // capability (e.g. approve_crisis_keyword, dismiss_crisis_keyword) anyway.
  // Real enforcement is tracked as a separate follow-up, deliberately kept
  // out of this phase to avoid a cross-cutting change to createToolCallback,
  // the shared wrapper every registered tool runs through.
  requiredScope: SupportedScope
  minPlanTier: 'STARTER' | 'PRO' | 'AGENCY'
  mutates: boolean
  // Only set true for a capability whose response embeds third-party text
  // (per parent spec 6.1) -- call_capability applies wrapUntrusted generically
  // when this is set, the same framing list_inbox_items already uses.
  wrapsUntrustedContent?: boolean
  // Explicit, reviewable declaration of how call_capability scopes this
  // request to a workspace -- 'explicit' merges the caller's resolved
  // workspaceId into the outgoing query/body; 'derived-from-path' means the
  // endpoint already operates on a specific resource id (a :placeholder),
  // and the backend route derives the workspace from that resource instead,
  // so call_capability sends no workspaceId at all. This is deliberately a
  // field on the definition, not inferred from the presence of a
  // `:placeholder` in `endpoint` -- inferring it would let a future entry's
  // workspace-scoping behavior change silently just because someone did or
  // didn't put a colon in a URL, with no reviewer signal either way.
  // NOTE: 'derived-from-path' is a known gap, not a verified guarantee --
  // the backing routes for these capabilities scope by "does this user
  // have access to *any* workspace containing this resource," not by the
  // specific workspace_id the caller claimed. Closing that gap requires
  // backend-side changes in the main LYRA app (out of scope for this
  // MCP-gateway-only phase); tracked separately as a follow-up. Because of
  // this gap, call_capability also suppresses the workspace-name
  // echo-back (see §6.2 in call-capability.ts) for every capability
  // declaring this value -- the claimed workspace can't be trusted as an
  // accurate confirmation of what actually got mutated.
  workspaceScoping: 'explicit' | 'derived-from-path'
}

// Every long-tail capability beyond the 10 core tools, as one manifest entry
// each -- no hand-written tool function per capability. Every endpoint/method/
// paramSchema below was checked against the real backing route in the main
// app during this plan's writing, not assumed. `:placeholder` segments in
// `endpoint` are path parameters, substituted from paramSchema's matching
// field by call_capability before anything is left over for a query string
// or POST/DELETE body -- see call_capability.ts for the substitution logic.
export const CAPABILITY_REGISTRY: Record<string, CapabilityDefinition> = {
  list_competitors: {
    description: 'List tracked competitors for a workspace, each with their latest snapshot.',
    endpoint: '/api/competitors',
    method: 'GET',
    paramSchema: z.object({}),
    requiredScope: 'content:read',
    minPlanTier: 'PRO',
    mutates: false,
    // Competitor snapshots contain scraped third-party public content --
    // same prompt-injection risk class as a hostile comment or review.
    wrapsUntrustedContent: true,
    workspaceScoping: 'explicit',
  },
  add_competitor: {
    description: 'Add a competitor to track for a workspace (name plus optional website/social handles). Max 10 per workspace.',
    endpoint: '/api/competitors',
    method: 'POST',
    paramSchema: z.object({
      name: z.string().min(1),
      websiteUrl: z.string().optional(),
      twitterHandle: z.string().optional(),
      facebookPageId: z.string().optional(),
      instagramHandle: z.string().optional(),
      linkedinPageId: z.string().optional(),
    }),
    requiredScope: 'content:write',
    minPlanTier: 'PRO',
    mutates: true,
    workspaceScoping: 'explicit',
  },
  remove_competitor: {
    description: 'Remove a tracked competitor. Requires the competitor id, obtainable from a prior listing.',
    endpoint: '/api/competitors/:id',
    method: 'DELETE',
    paramSchema: z.object({ id: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'PRO',
    mutates: true,
    workspaceScoping: 'derived-from-path',
  },
  get_seo_search_data: {
    description: 'Get Google Search Console top queries and click trend for a workspace. Requires GSC to already be connected -- returns a reconnect_required error if not.',
    endpoint: '/api/seo/gsc-data',
    method: 'GET',
    paramSchema: z.object({}),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
    // Search queries are free-form text typed by anonymous searchers on
    // Google -- externally influenceable, same risk class as a hostile
    // comment or scraped competitor content.
    wrapsUntrustedContent: true,
    workspaceScoping: 'explicit',
  },
  list_seo_pages: {
    description: 'List pages tracked for on-page SEO scoring in a workspace.',
    endpoint: '/api/seo/pages',
    method: 'GET',
    paramSchema: z.object({}),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
    workspaceScoping: 'explicit',
  },
  track_seo_page: {
    description: 'Start tracking a page for on-page SEO scoring. Required before analyze_seo_page or generate_seo_content can be used on that page.',
    endpoint: '/api/seo/pages',
    method: 'POST',
    paramSchema: z.object({ url: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
    workspaceScoping: 'explicit',
  },
  analyze_seo_page: {
    description: 'Run on-page SEO scoring for a tracked page (title, meta description, H1, overall score). Requires the page id from list_seo_pages/track_seo_page.',
    endpoint: '/api/seo/pages/:pageId/analyze',
    method: 'POST',
    paramSchema: z.object({ pageId: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
    // currentTitle/currentMeta/currentH1 are scraped live from the tracked
    // page's real HTML, and track_seo_page accepts any URL with no domain
    // restriction -- this is scraped third-party HTML returned verbatim.
    wrapsUntrustedContent: true,
    workspaceScoping: 'derived-from-path',
  },
  generate_seo_content: {
    description: 'AI-generate a new meta title, meta description, H1, and intro paragraph for a tracked page, based on its current on-page analysis and the workspace brand profile. Requires the page id from list_seo_pages/track_seo_page.',
    endpoint: '/api/seo/pages/:pageId/generate',
    method: 'POST',
    paramSchema: z.object({ pageId: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
    workspaceScoping: 'derived-from-path',
  },
  analyze_engagement_patterns: {
    description: "Analyze a workspace's published post history to derive best-posting-time patterns, saved into the brand profile. Requires a brand profile to already exist.",
    endpoint: '/api/brand-intelligence/analyze-engagement',
    method: 'POST',
    paramSchema: z.object({}),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
    workspaceScoping: 'explicit',
  },
  rebuild_brand_profile: {
    description: 'Rebuild the full brand profile for a workspace (voice, tone, themes, audience, and crisis-keyword suggestions if Crisis Aware is on) by scraping the website and analyzing recent posts. Expensive -- rate-limited to 5 per 5 minutes per user.',
    endpoint: '/api/brand-intelligence/build',
    method: 'POST',
    paramSchema: z.object({ manualGuidelines: z.string().optional() }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
    workspaceScoping: 'explicit',
  },
  approve_crisis_keyword: {
    description: 'Approve a suggested (or manually specified) crisis-escalation keyword into an active Always Escalate guardrail. Approving an already-active keyword is a harmless no-op.',
    endpoint: '/api/brand-intelligence/crisis-keywords/approve',
    method: 'POST',
    // The backend matches this keyword against comment text via a
    // case-insensitive SUBSTRING check (see response-generator.ts's
    // `contentLower.includes(trigger.toLowerCase())`), not a word-boundary
    // match -- so a too-short or purely-symbolic "keyword" would escalate
    // almost every future comment. min(3) + a 3-letter run is a floor
    // against that, not a claim that every string clearing it is a good
    // keyword choice ("the" clears it and is still a dangerously broad
    // substring guardrail -- that's a content-judgment problem no schema
    // can fully solve). `.trim()` is chained BEFORE `.min(3)` deliberately:
    // the backend's own route trims before storing
    // (crisis-keywords/approve/route.ts: `keyword.trim().toLowerCase()`),
    // so a schema that measured length before trimming would let
    // whitespace-padded input like " a " (3 raw chars) through, only for
    // the backend to store the single-character "a" it was meant to
    // reject -- the exact bypass this floor exists to close. See
    // remove_guardrail below for how to undo an approval once made --
    // there was previously no way to do that via this capability surface
    // at all.
    paramSchema: z.object({
      keyword: z.string().trim().min(3).regex(/[a-zA-Z]{3}/, 'must contain at least 3 letters'),
      category: z.string().optional(),
    }),
    requiredScope: 'settings:write',
    minPlanTier: 'STARTER',
    mutates: true,
    workspaceScoping: 'explicit',
  },
  dismiss_crisis_keyword: {
    description: 'Dismiss a suggested crisis-escalation keyword without making it an active guardrail.',
    endpoint: '/api/brand-intelligence/crisis-keywords/dismiss',
    method: 'POST',
    paramSchema: z.object({ keyword: z.string().min(1) }),
    requiredScope: 'settings:write',
    minPlanTier: 'STARTER',
    mutates: true,
    workspaceScoping: 'explicit',
  },
  remove_guardrail: {
    // Backed by DELETE /api/guardrails/:id (LYRA/lyra/app/api/guardrails/[id]/route.ts),
    // a hard delete on the raw Guardrail row -- the model has no
    // active/enabled flag to toggle instead (checked against
    // prisma/schema.prisma: id, workspaceId, type, value, createdAt only).
    // That route authorizes by "does the caller have non-CLIENT_VIEW access
    // to the workspace that owns this guardrail id," the same
    // resource-owns-the-workspace pattern as remove_competitor, hence
    // 'derived-from-path' below. The route deletes any GuardrailType by id,
    // not just crisis keywords, so the capability is named and scoped for
    // what it actually does rather than narrowed to the crisis-keyword
    // case.
    //
    // This is the undo path for approve_crisis_keyword (which creates an
    // ALWAYS_ESCALATE guardrail) -- approve_crisis_keyword's backing route
    // (crisis-keywords/approve/route.ts) returns the full created Guardrail
    // row, id included, in its response, so the id needed here is already
    // in hand right after approving: approve, capture `id` from that
    // response, remove_guardrail later if the keyword turns out too broad.
    // Deliberately kept out of the description field below, though: an
    // earlier draft of this description named approve_crisis_keyword
    // directly and said "find it in the settings UI" (which was also just
    // wrong -- there was no other capability that surfaced the id, and the
    // real source is the approve call's own response, not a UI). Both of
    // those made this entry's own name+description the sole
    // matchCapabilityEntries hit for unrelated single-word queries like
    // "settings" -- the identical cross-reference/keyword-pollution pattern
    // already fixed for remove_competitor elsewhere in this file. Hence the
    // generic, capability-name-free phrasing below; this comment is where
    // the specific "which call, and how" guidance belongs instead.
    description: 'Permanently delete an active guardrail (e.g. a crisis-escalation trigger, or any other guardrail type) by its id. Requires the guardrail id, obtainable from the response of whichever call created the guardrail.',
    endpoint: '/api/guardrails/:id',
    method: 'DELETE',
    paramSchema: z.object({ id: z.string().min(1) }),
    requiredScope: 'settings:write',
    minPlanTier: 'STARTER',
    mutates: true,
    workspaceScoping: 'derived-from-path',
  },
  list_email_campaigns: {
    description: "List a workspace's scheduled/sent email campaigns for a given month (defaults to the current month) from connected ESP integrations (Klaviyo, Mailchimp, Customer.io).",
    endpoint: '/api/email-campaigns',
    method: 'GET',
    paramSchema: z.object({ month: z.string().optional() }),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
    workspaceScoping: 'explicit',
  },
  score_content: {
    description: 'Score draft content across six dimensions (hook, clarity, CTA, length, hashtags, emotional resonance) for a given platform, without creating a post.',
    endpoint: '/api/ai/score-content',
    method: 'POST',
    paramSchema: z.object({ content: z.string().min(10), platform: z.string() }),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
    workspaceScoping: 'explicit',
  },
  generate_schedule: {
    description: 'AI-generate a batch of on-brand draft posts (1-7) for one platform in a given week, using brand voice and posting-pattern data. Does not persist or schedule anything -- pass the results to draft_post/schedule_post to save them.',
    endpoint: '/api/schedule/generate',
    method: 'POST',
    paramSchema: z.object({
      weekNumber: z.number().int(),
      weekStartDate: z.string(),
      platform: z.string(),
      count: z.number().int().min(1).max(7),
    }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: false,
    workspaceScoping: 'explicit',
  },
}
