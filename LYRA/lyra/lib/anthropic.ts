import Anthropic from '@anthropic-ai/sdk'

// SDK default is 10 minutes -- far too long for calls made from request handlers,
// cron jobs, and BullMQ workers that must not hang indefinitely on a stalled
// upstream. 60s comfortably covers our longest generations (report narratives,
// brand profile synthesis) without risking an unbounded wait.
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 })
export const CLAUDE_MODEL = 'claude-sonnet-4-6' as const
