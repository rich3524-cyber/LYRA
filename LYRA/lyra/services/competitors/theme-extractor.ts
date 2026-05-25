import { anthropic } from '@/lib/anthropic'

export async function extractThemes(posts: string[]): Promise<string[]> {
  if (posts.length === 0) return []

  const prompt = `Given these recent post titles/excerpts from a competitor's content, identify 3–5 content themes.
Return ONLY a JSON array of short phrase strings (2–5 words each).
Example: ["product launches", "customer testimonials", "tutorials"]

Posts:
${posts.map((p, i) => `${i + 1}. ${p}`).join('\n')}
`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const themes = JSON.parse(text)
    return Array.isArray(themes) ? themes.slice(0, 5) : []
  } catch {
    return []
  }
}
