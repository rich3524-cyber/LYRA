// LYRA/lyra-mcp/scripts/eval-cases.ts

export interface EvalCase {
  prompt: string
  expectedTool: string
  expectedParams?: Record<string, unknown>
}

// ~30 realistic prompts a real agency user might ask, spanning the 12 core
// tools plus search_capabilities/call_capability and every capability in
// CAPABILITY_REGISTRY. Drafted during Phase 3 implementation -- reviewed by
// Richard before being treated as the real baseline, per the design spec's
// "he knows what users actually ask better than a draft can guess" note.
// Re-run (npm run eval) whenever the registry changes.
//
// expectedParams is informational only (see tool-selection-eval.ts's
// paramsCorrect note) -- it never gates pass/fail, only tool-selection
// correctness (expectedTool) does. Most call_capability cases therefore only
// assert the `name` key (which capability got invoked), not its nested
// `params`, since that's the thing actually worth catching a regression on.
export const EVAL_CASES: EvalCase[] = [
  { prompt: 'What workspaces do I have access to?', expectedTool: 'list_workspaces' },
  { prompt: "What's pending approval in my Into The Wild Marketing workspace?", expectedTool: 'get_workspace_overview' },
  { prompt: 'Tell me about our brand voice and tone for the LYRA workspace before I write a post.', expectedTool: 'get_brand_profile' },
  { prompt: 'What do we have scheduled for next week?', expectedTool: 'list_scheduled_posts' },
  { prompt: 'How did our posts perform over the last 30 days?', expectedTool: 'get_analytics' },
  { prompt: "What's in our inbox that needs a response?", expectedTool: 'list_inbox_items' },
  { prompt: 'Any new trends I should know about?', expectedTool: 'list_trends' },
  { prompt: 'Draft a Facebook post announcing our new service launch.', expectedTool: 'draft_post', expectedParams: { platforms: ['facebook'] } },
  { prompt: 'Schedule a LinkedIn post for tomorrow at 9am about our webinar.', expectedTool: 'schedule_post', expectedParams: { platforms: ['linkedin'] } },
  { prompt: 'Reply to the comment from Jane asking about pricing.', expectedTool: 'respond_to_item' },
  { prompt: 'What tools do you have for tracking competitors?', expectedTool: 'search_capabilities' },
  { prompt: 'Find any capabilities related to SEO.', expectedTool: 'search_capabilities' },
  { prompt: 'Are there any brand intelligence tools available?', expectedTool: 'search_capabilities' },
  { prompt: "List the competitors we're currently tracking.", expectedTool: 'call_capability', expectedParams: { name: 'list_competitors' } },
  { prompt: 'Add Acme Corp as a competitor to track, their website is acme.com.', expectedTool: 'call_capability', expectedParams: { name: 'add_competitor' } },
  { prompt: 'Stop tracking the competitor with id comp-123.', expectedTool: 'call_capability', expectedParams: { name: 'remove_competitor' } },
  { prompt: 'What are our top Google search queries right now?', expectedTool: 'call_capability', expectedParams: { name: 'get_seo_search_data' } },
  { prompt: 'What pages are we tracking for SEO?', expectedTool: 'call_capability', expectedParams: { name: 'list_seo_pages' } },
  { prompt: 'Start tracking our pricing page at example.com/pricing for SEO.', expectedTool: 'call_capability', expectedParams: { name: 'track_seo_page' } },
  { prompt: 'Run an SEO analysis on our tracked page with id page-1.', expectedTool: 'call_capability', expectedParams: { name: 'analyze_seo_page' } },
  { prompt: 'Generate a new meta title and description for our tracked page page-1.', expectedTool: 'call_capability', expectedParams: { name: 'generate_seo_content' } },
  { prompt: 'Analyze our posting history to find our best times to post.', expectedTool: 'call_capability', expectedParams: { name: 'analyze_engagement_patterns' } },
  { prompt: 'Rebuild our brand profile from scratch.', expectedTool: 'call_capability', expectedParams: { name: 'rebuild_brand_profile' } },
  { prompt: 'Approve the suggested crisis keyword "lawsuit".', expectedTool: 'call_capability', expectedParams: { name: 'approve_crisis_keyword' } },
  { prompt: 'Dismiss the suggested crisis keyword "refund".', expectedTool: 'call_capability', expectedParams: { name: 'dismiss_crisis_keyword' } },
  { prompt: 'What email campaigns do we have scheduled this month?', expectedTool: 'call_capability', expectedParams: { name: 'list_email_campaigns' } },
  { prompt: "Score this draft for Instagram before I post it: 'Check out our new product line, available now!'", expectedTool: 'call_capability', expectedParams: { name: 'score_content' } },
  { prompt: 'Generate 5 draft posts for LinkedIn for next week.', expectedTool: 'call_capability', expectedParams: { name: 'generate_schedule' } },
  { prompt: "What's trending right now that we could turn into a post?", expectedTool: 'list_trends' },
  { prompt: "I have two workspaces -- for Into The Wild Marketing specifically, what's our autonomy setting and how many things are pending?", expectedTool: 'get_workspace_overview' },
]
