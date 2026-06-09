import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { getValidToken } from '@/lib/token-refresh'

const worker = new Worker(
  'post-publishing',
  async (job) => {
    const { postId } = job.data as { postId: string }

    const post = await prisma.post.findUnique({
      where:   { id: postId },
      include: { socialAccount: true },
    })
    if (!post || post.status !== 'SCHEDULED') return

    // Crisis check — skip publishing but keep post SCHEDULED so it retries once crisis resolves
    try {
      const workspaceMeta = await prisma.workspace.findUnique({
        where:  { id: post.workspaceId },
        select: { crisisActive: true },
      })
      if (workspaceMeta?.crisisActive) {
        console.log(`Skipping post ${post.id} — crisis active for workspace ${post.workspaceId}`)
        return
      }
    } catch (err) {
      console.error(`Crisis check failed for post ${post.id}:`, err)
      return  // Let BullMQ retry this job
    }

    await prisma.post.update({ where: { id: postId }, data: { status: 'PUBLISHING' } })

    const token = await getValidToken(post.socialAccount)
    let platformPostId: string | undefined

    try {
      switch (post.socialAccount.platform) {
        case 'FACEBOOK': {
          const res  = await fetch(
            `https://graph.facebook.com/v19.0/${post.socialAccount.platformId}/feed`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ message: post.content, access_token: token }),
            }
          )
          const data = await res.json() as { id?: string }
          platformPostId = data.id
          break
        }
        case 'INSTAGRAM': {
          // Two-step: create container then publish
          const containerRes = await fetch(
            `https://graph.facebook.com/v19.0/${post.socialAccount.platformId}/media`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ caption: post.content, access_token: token }),
            }
          )
          const container = await containerRes.json() as { id?: string; error?: { message: string } }
          // Graph API can return HTTP 200 with an error body — check explicitly
          if (container.error) throw new Error(`Instagram container creation failed: ${container.error.message}`)
          if (!container.id) throw new Error('Instagram container creation returned no ID')

          const publishRes = await fetch(
            `https://graph.facebook.com/v19.0/${post.socialAccount.platformId}/media_publish`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ creation_id: container.id, access_token: token }),
            }
          )
          const published = await publishRes.json() as { id?: string; error?: { message: string } }
          if (published.error) throw new Error(`Instagram publish failed: ${published.error.message}`)
          platformPostId = published.id
          break
        }
        case 'LINKEDIN': {
          const res  = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              author:         `urn:li:organization:${post.socialAccount.platformId}`,
              lifecycleState: 'PUBLISHED',
              specificContent: {
                'com.linkedin.ugc.ShareContent': {
                  shareCommentary:  { text: post.content },
                  shareMediaCategory: 'NONE',
                },
              },
              visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
            }),
          })
          platformPostId = res.headers.get('x-restli-id') ?? undefined
          break
        }
        case 'TWITTER': {
          const res  = await fetch('https://api.twitter.com/2/tweets', {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ text: post.content }),
          })
          const data = await res.json() as { data?: { id?: string } }
          platformPostId = data.data?.id
          break
        }
        default:
          console.warn(`No publisher implemented for platform: ${post.socialAccount.platform}`)
      }

      await prisma.post.update({
        where: { id: postId },
        data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId },
      })
    } catch (err) {
      // Only permanently mark FAILED after all retries are exhausted.
      // Setting FAILED before rethrowing would make BullMQ re-enter and skip on retry
      // (post.status !== 'SCHEDULED' guard at line 15).
      const maxAttempts = job.opts.attempts ?? 1
      if (job.attemptsMade >= maxAttempts) {
        await prisma.post.update({ where: { id: postId }, data: { status: 'FAILED' } })
      }
      throw err
    }
  },
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`Post ${job?.data.postId} failed:`, err)
})

export default worker
