import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractArticleText, repurposeContent } from '@/services/ai/content-repurposer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, sourceType, source, platforms } = await req.json() as {
      workspaceId: string
      sourceType: 'url' | 'text'
      source: string
      platforms: string[]
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }

    if (!source || !platforms || platforms.length === 0) {
      return new Response(JSON.stringify({ error: 'source and platforms are required' }), { status: 422 })
    }

    let sourceText: string
    if (sourceType === 'url') {
      try {
        sourceText = await extractArticleText(source)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not fetch that URL.'
        return new Response(JSON.stringify({ error: msg }), { status: 422 })
      }
    } else {
      sourceText = source
    }

    if (sourceText.length < 50) {
      return new Response(JSON.stringify({ error: 'Content too short to repurpose.' }), { status: 422 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let count = 0
          for await (const post of repurposeContent(sourceText, platforms)) {
            const line = `data: ${JSON.stringify({ type: 'post', platform: post.platform, content: post.content })}\n\n`
            controller.enqueue(encoder.encode(line))
            count++
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', total: count })}\n\n`))
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Generation failed' })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
