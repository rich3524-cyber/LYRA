// Safe parser for Claude API responses that may include markdown code fences.
// Claude frequently wraps JSON output in ```json ... ``` — this strips it before parsing.

export function parseClaudeJson<T>(text: string, context: string): T {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.error(`[parseClaudeJson] Failed to parse ${context}:`, err)
    console.error(`[parseClaudeJson] Raw text (first 500 chars):`, text.slice(0, 500))
    throw new Error(`Claude returned unparseable JSON for ${context}`)
  }
}
