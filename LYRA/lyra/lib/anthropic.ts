import Anthropic from '@anthropic-ai/sdk'

// SDK default is 10 minutes -- far too long for calls made from request handlers,
// cron jobs, and BullMQ workers that must not hang indefinitely on a stalled
// upstream. 60s comfortably covers our longest generations (report narratives,
// brand profile synthesis) without risking an unbounded wait.
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 })
export const CLAUDE_MODEL = 'claude-sonnet-4-6' as const

// `content` can theoretically be empty (e.g. a stop reason with no text block),
// so index access without an optional check risks a TypeError -- this was
// previously duplicated, unsafely, across every caller.
export function extractClaudeText(response: Anthropic.Message): string {
  const block = response.content[0]
  return block?.type === 'text' ? block.text.trim() : ''
}

// Prompts that fence untrusted content between XML-style tags (e.g.
// <untrusted_comment>...</untrusted_comment>) are only as safe as the fence itself --
// if the untrusted text contains a literal closing tag, it can prematurely end the
// fence and cause whatever follows to be read as trusted instructions rather than
// data. Breaking any close-tag-like substring before interpolation closes that gap.
export function neutralizeFenceCloser(text: string, tagName: string): string {
  const closeTag = new RegExp(`</${tagName}`, 'gi')
  return text.replace(closeTag, `</_${tagName}`)
}
