export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateWeekPosts } from '@/services/ai/schedule-generator'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    const body = await req.json() as {
      workspaceId: string
      durationWeeks: 3 | 6
      platforms: Record<string, number>
    }
    const { workspaceId, durationWeeks, platforms } = body

    if (!workspaceId || !durationWeeks || !platforms) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }
    if (durationWeeks !== 3 && durationWeeks !== 6) {
      return new Response(JSON.stringify({ error: 'durationWeeks must be 3 or 6' }), { status: 400 })
    }
    const platformEntries = Object.entries(platforms)
    if (platformEntries.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one platform required' }), { status: 400 })
    }
    for (const [, count] of platformEntries) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 7) {
        return new Response(JSON.stringify({ error: 'Platform post counts must be integers between 1 and 7' }), { status: 400 })
      }
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      include: { brandProfile: true },
    })

    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), { status: 404 })
    }
    if (!workspace.brandProfile) {
      return new Response(JSON.stringify({ error: 'Brand profile required' }), { status: 400 })
    }

    const brand = {
      voiceSummary: workspace.brandProfile.voiceSummary,
      toneAttributes: workspace.brandProfile.toneAttributes,
      contentThemes: workspace.brandProfile.contentThemes,
      audienceProfile: workspace.brandProfile.audienceProfile,
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        }

        try {
          // Start from next Monday at midnight UTC
          const weekStart = new Date()
          weekStart.setUTCHours(0, 0, 0, 0)
          const dayOfWeek = weekStart.getUTCDay() // 0 = Sunday
          const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
          weekStart.setUTCDate(weekStart.getUTCDate() + daysUntilMonday)

          for (let week = 1; week <= durationWeeks; week++) {
            send('progress', {
              week,
              total: durationWeeks,
              status: `Generating week ${week} of ${durationWeeks}…`,
            })

            const thisWeekStart = new Date(weekStart)
            thisWeekStart.setUTCDate(weekStart.getUTCDate() + (week - 1) * 7)

            const posts = await generateWeekPosts(brand, week, thisWeekStart, platforms)
            send('week_posts', { week, posts })
          }

          send('done', {})
        } catch (error) {
          send('error', {
            message: error instanceof Error ? error.message : 'Generation failed',
          })
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
    console.error('POST /api/schedule/generate error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
