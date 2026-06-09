export interface PerplexityResult {
  content:   string
  citations: string[]
}

export async function queryPerplexity(query: string): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:    'sonar',
        messages: [{ role: 'user', content: query }],
        stream:   false,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Perplexity ${res.status}: ${body}`)
    }

    const data = await res.json() as {
      choices:   { message: { content: string } }[]
      citations: string[]
    }

    return {
      content:   data.choices?.[0]?.message?.content ?? '',
      citations: data.citations ?? [],
    }
  } finally {
    clearTimeout(timeout)
  }
}
