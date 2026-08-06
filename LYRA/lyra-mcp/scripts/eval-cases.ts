// LYRA/lyra-mcp/scripts/eval-cases.ts

export interface EvalCase {
  prompt: string
  expectedTool: string
  expectedParams?: Record<string, unknown>
  // If set, this is a two-turn case: after confirming expectedTool was
  // selected correctly (almost always 'search_capabilities'), the eval
  // simulates that tool's real result using matchCapabilityEntries (no live
  // backend needed for pure search) and asks again, expecting this second
  // tool (almost always 'call_capability') with these params. Both hops
  // must succeed for the case to count as correct against the 90% bar.
  thenExpectedTool?: string
  thenExpectedParams?: Record<string, unknown>
}

// ~30 realistic prompts a real agency user might ask, spanning all 12 core
// tools in TOOL_REGISTRY (search_capabilities and call_capability are 2 of
// those 12, not additional) plus every capability in CAPABILITY_REGISTRY.
// Drafted during Phase 3 implementation -- reviewed by Richard before being
// treated as the real baseline, per the design spec's "he knows what users
// actually ask better than a draft can guess" note. Re-run (npm run eval)
// whenever the registry changes.
//
// expectedParams is informational only (see tool-selection-eval.ts's
// paramsCorrect note) -- it never gates pass/fail, only tool-selection
// correctness (expectedTool, and for two-turn cases thenExpectedTool) does.
// All call_capability cases therefore only assert the `name` key (which
// capability got invoked), not its nested `params`, since that's the thing
// actually worth catching a regression on.
//
// Known scope limitation: no case tests "the model correctly declines to
// call any tool at all," since the harness forces
// tool_choice: { type: 'any' } for every turn -- there is no prompt in this
// dataset that a well-behaved model should refuse or answer in prose
// instead of calling a tool. That's a deliberate boundary of what this
// harness measures (tool *selection* given that a call will happen), not an
// oversight.
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
  // Gives the comment id directly (matching how the capability cases below
  // already supply synthetic ids like comp-123/page-1) rather than making
  // the model guess or look one up first -- respond_to_item/list_inbox_items
  // aren't given two-turn support in this harness, so a prompt that required
  // a lookup-then-reply flow would be unfairly marked wrong.
  { prompt: "Reply to comment cmt-456 from Jane, who's asking about pricing.", expectedTool: 'respond_to_item' },
  // Reworded to sound like a real ITWM agency user rather than someone who
  // knows the tool's own vocabulary ("capabilities") -- verified via
  // matchCapabilityEntries to surface list_competitors/remove_competitor.
  { prompt: 'Can you keep tabs on our competitors for me?', expectedTool: 'search_capabilities' },
  // Verified via matchCapabilityEntries to surface the 5 SEO capabilities
  // (get_seo_search_data, list_seo_pages, track_seo_page, analyze_seo_page,
  // generate_seo_content) as the top-scoring results.
  { prompt: 'Can you help with anything on the SEO side?', expectedTool: 'search_capabilities' },
  // Avoids the internal API-path term "brand intelligence" -- verified via
  // matchCapabilityEntries to surface rebuild_brand_profile as the clear
  // top-scoring match.
  { prompt: 'Is there anything you can do to help build out our brand profile?', expectedTool: 'search_capabilities' },
  // The following 15 cases cover every entry in CAPABILITY_REGISTRY. Each is
  // two-turn: TOOL_REGISTRY's own descriptions document search_capabilities
  // -> call_capability as the required protocol (call_capability's
  // description says "Invoke a capability found via search_capabilities";
  // search_capabilities's says "Call call_capability with a result's name to
  // actually invoke it"), so a model that follows its own tool descriptions
  // calls search_capabilities first, not call_capability cold.
  { prompt: "List the competitors we're currently tracking.", expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'list_competitors' } },
  { prompt: 'Add Acme Corp as a competitor to track, their website is acme.com.', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'add_competitor' } },
  { prompt: 'Stop tracking the competitor with id comp-123.', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'remove_competitor' } },
  { prompt: 'What are our top Google search queries right now?', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'get_seo_search_data' } },
  { prompt: 'What pages are we tracking for SEO?', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'list_seo_pages' } },
  { prompt: 'Start tracking our pricing page at example.com/pricing for SEO.', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'track_seo_page' } },
  { prompt: 'Run an SEO analysis on our tracked page with id page-1.', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'analyze_seo_page' } },
  { prompt: 'Generate a new meta title and description for our tracked page page-1.', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'generate_seo_content' } },
  // Reworded to point at analyze_engagement_patterns's actual behavior
  // (saving derived posting-time patterns into the brand profile for future
  // use) rather than generic "find our best times to post," which reads as
  // equally answerable by get_analytics.
  {
    prompt: 'Figure out our best posting times from our past history and save that to our brand profile so future scheduling can use it.',
    expectedTool: 'search_capabilities',
    thenExpectedTool: 'call_capability',
    thenExpectedParams: { name: 'analyze_engagement_patterns' },
  },
  { prompt: 'Rebuild our brand profile from scratch.', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'rebuild_brand_profile' } },
  { prompt: 'Approve the suggested crisis keyword "lawsuit".', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'approve_crisis_keyword' } },
  { prompt: 'Dismiss the suggested crisis keyword "refund".', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'dismiss_crisis_keyword' } },
  { prompt: 'What email campaigns do we have scheduled this month?', expectedTool: 'search_capabilities', thenExpectedTool: 'call_capability', thenExpectedParams: { name: 'list_email_campaigns' } },
  // Reworded to make explicit that nothing should be created/posted -- the
  // original phrasing was ambiguous with draft_post, whose own description
  // says it also returns a six-dimension content score, and the model can't
  // see that score_content explicitly does not create anything.
  {
    prompt: "I don't want you to post or create anything yet -- just tell me how this draft scores for Instagram: 'Check out our new product line, available now!'",
    expectedTool: 'search_capabilities',
    thenExpectedTool: 'call_capability',
    thenExpectedParams: { name: 'score_content' },
  },
  // Reworded to avoid the literal phrase "draft posts" (draft_post's own
  // tool name and the first words of its description), while still matching
  // generate_schedule's actual description language ("a batch of on-brand
  // draft posts... for one platform in a given week").
  {
    prompt: 'Put together a batch of on-brand LinkedIn content for next week -- five posts total.',
    expectedTool: 'search_capabilities',
    thenExpectedTool: 'call_capability',
    thenExpectedParams: { name: 'generate_schedule' },
  },
  // Replaces a near-duplicate of the list_trends case above (which tested
  // the same "what's trending" phrasing twice). This one instead probes the
  // list_trends/get_analytics boundary: "trending" nudges toward list_trends,
  // but "our engagement" asks about the workspace's own past performance,
  // which is what get_analytics actually reports -- list_trends is about
  // external, brand-relevance-scored trend content, not the workspace's own
  // historical metrics.
  { prompt: 'How has our engagement been trending over the past month?', expectedTool: 'get_analytics' },
  // Replaces a near-duplicate of the "what's pending" case above (which only
  // added a "two workspaces" framing that didn't test selection any
  // differently). This one instead probes the
  // get_workspace_overview/list_inbox_items boundary: get_workspace_overview
  // is the better real answer because its own description already aggregates
  // "pending approval queue depth, inbox pending count, and crisis state" --
  // a single-call summary of everything needing attention -- while
  // list_inbox_items only covers comments/reviews, a narrower subset of what
  // "needs my attention" is asking about.
  { prompt: 'What needs my attention today in the LYRA workspace?', expectedTool: 'get_workspace_overview' },
]
