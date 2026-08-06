import { z } from 'zod'

export interface CapabilityDefinition {
  description: string
  endpoint: string
  method: 'GET' | 'POST' | 'DELETE'
  paramSchema: z.ZodTypeAny
  requiredScope: string
  minPlanTier: 'STARTER' | 'PRO' | 'AGENCY'
  mutates: boolean
  // Only set true for a capability whose response embeds third-party text
  // (per parent spec 6.1) -- call_capability applies wrapUntrusted generically
  // when this is set, the same framing list_inbox_items already uses.
  wrapsUntrustedContent?: boolean
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
  },
  remove_competitor: {
    description: 'Stop tracking a competitor. Requires the competitor id (from list_competitors).',
    endpoint: '/api/competitors/:id',
    method: 'DELETE',
    paramSchema: z.object({ id: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'PRO',
    mutates: true,
  },
  get_seo_search_data: {
    description: 'Get Google Search Console top queries and click trend for a workspace. Requires GSC to already be connected -- returns a reconnect_required error if not.',
    endpoint: '/api/seo/gsc-data',
    method: 'GET',
    paramSchema: z.object({}),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
  },
  list_seo_pages: {
    description: 'List pages tracked for on-page SEO scoring in a workspace.',
    endpoint: '/api/seo/pages',
    method: 'GET',
    paramSchema: z.object({}),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
  },
  track_seo_page: {
    description: 'Start tracking a page for on-page SEO scoring. Required before analyze_seo_page or generate_seo_content can be used on that page.',
    endpoint: '/api/seo/pages',
    method: 'POST',
    paramSchema: z.object({ url: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
  },
  analyze_seo_page: {
    description: 'Run on-page SEO scoring for a tracked page (title, meta description, H1, overall score). Requires the page id from list_seo_pages/track_seo_page.',
    endpoint: '/api/seo/pages/:pageId/analyze',
    method: 'POST',
    paramSchema: z.object({ pageId: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
  },
  generate_seo_content: {
    description: 'AI-generate a new meta title, meta description, H1, and intro paragraph for a tracked page, based on its current on-page analysis and the workspace brand profile. Requires the page id from list_seo_pages/track_seo_page.',
    endpoint: '/api/seo/pages/:pageId/generate',
    method: 'POST',
    paramSchema: z.object({ pageId: z.string().min(1) }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
  },
  analyze_engagement_patterns: {
    description: "Analyze a workspace's published post history to derive best-posting-time patterns, saved into the brand profile. Requires a brand profile to already exist.",
    endpoint: '/api/brand-intelligence/analyze-engagement',
    method: 'POST',
    paramSchema: z.object({}),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
  },
  rebuild_brand_profile: {
    description: 'Rebuild the full brand profile for a workspace (voice, tone, themes, audience, and crisis-keyword suggestions if Crisis Aware is on) by scraping the website and analyzing recent posts. Expensive -- rate-limited to 5 per 5 minutes per user.',
    endpoint: '/api/brand-intelligence/build',
    method: 'POST',
    paramSchema: z.object({ manualGuidelines: z.string().optional() }),
    requiredScope: 'content:write',
    minPlanTier: 'STARTER',
    mutates: true,
  },
  approve_crisis_keyword: {
    description: 'Approve a suggested (or manually specified) crisis-escalation keyword into an active Always Escalate guardrail. Approving an already-active keyword is a harmless no-op.',
    endpoint: '/api/brand-intelligence/crisis-keywords/approve',
    method: 'POST',
    paramSchema: z.object({ keyword: z.string().min(1), category: z.string().optional() }),
    requiredScope: 'settings:write',
    minPlanTier: 'STARTER',
    mutates: true,
  },
  dismiss_crisis_keyword: {
    description: 'Dismiss a suggested crisis-escalation keyword without making it an active guardrail.',
    endpoint: '/api/brand-intelligence/crisis-keywords/dismiss',
    method: 'POST',
    paramSchema: z.object({ keyword: z.string().min(1) }),
    requiredScope: 'settings:write',
    minPlanTier: 'STARTER',
    mutates: true,
  },
  list_email_campaigns: {
    description: "List a workspace's scheduled/sent email campaigns for a given month (defaults to the current month) from connected ESP integrations (Klaviyo, Mailchimp, Customer.io).",
    endpoint: '/api/email-campaigns',
    method: 'GET',
    paramSchema: z.object({ month: z.string().optional() }),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
  },
  score_content: {
    description: 'Score draft content across six dimensions (hook, clarity, CTA, length, hashtags, emotional resonance) for a given platform, without creating a post.',
    endpoint: '/api/ai/score-content',
    method: 'POST',
    paramSchema: z.object({ content: z.string().min(10), platform: z.string() }),
    requiredScope: 'content:read',
    minPlanTier: 'STARTER',
    mutates: false,
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
  },
}
