export interface PromptDefinition {
  description: string
  message: string
}

// The 4 guided entry points named in the parent spec 4.3 -- each a starting
// message pointing Claude toward the right sequence of tool calls, not a
// full script. No parameters (arguments) on any of these for v1; the
// starting message itself asks Claude to gather anything it needs (e.g.
// "which workspace?") via the normal tool-calling flow.
export const PROMPT_REGISTRY: Record<string, PromptDefinition> = {
  plan_next_week: {
    description: "Plan next week's content for a workspace",
    message:
      'Help me plan next week\'s content. Start by calling list_workspaces if you don\'t already know which workspace I mean, then get_brand_profile for that workspace -- always check brand voice before generating any content, it\'s the difference between generic output and something that actually sounds like this business. Then check get_workspace_overview for anything already pending, and list_scheduled_posts to see what\'s already on the calendar for that week, so you don\'t propose duplicates, and propose a week of posts using draft_post (or schedule_post if I confirm specific dates/times).',
  },
  triage_inbox: {
    description: 'Triage the inbox across all workspaces',
    message:
      'Help me triage my inbox. Call list_workspaces first, then list_inbox_items for each workspace I have access to. For anything that needs a response, use respond_to_item -- but remember whether it actually sends or only drafts is controlled entirely by each workspace\'s own autonomy setting, never by you or me choosing to send. Flag anything escalated separately; those need a human, not an AI draft.',
  },
  summarise_client_performance: {
    description: "Summarise last month's performance for a client",
    message:
      'Summarise last month\'s performance for a client. Start with list_workspaces to confirm which one, then get_analytics for the last 30 days. If it\'s relevant, search_capabilities for \'seo\' or \'competitors\' to round out the picture (e.g. get_seo_search_data, list_competitors, list_email_campaigns). Give me a narrative summary I could actually send to a client, not just raw numbers.',
  },
  turn_trend_into_post: {
    description: 'Turn a trend into a scheduled post',
    message:
      'Help me turn a trend into a post. Call list_trends for the workspace -- if it\'s unavailable, relay the message it returns verbatim rather than guessing why. Otherwise pick a trend, check get_brand_profile first so the post carries the workspace\'s actual voice rather than a generic take on the trend, then draft_post or schedule_post with the trend\'s brand-relevance context folded in.',
  },
}
