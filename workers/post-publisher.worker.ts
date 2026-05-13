import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'

const worker = new Worker(
  'post-publishing',
  async (job) => {
    const { postId } = job.data as { postId: string }

    const post = await prisma.post.findUnique({
      where:   { id: postId },
      include: { socialAccount: true },
    })
    if (!post || post.status !== 'SCHEDULED') return

    await prisma.post.update({ where: { id: postId }, data: { status: 'PUBLISHING' } })

    const token = decrypt(post.socialAccount.accessToken)
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
          const container = await containerRes.json() as { id?: string }
          if (container.id) {
            const publishRes = await fetch(
              `https://graph.facebook.com/v19.0/${post.socialAccount.platformId}/media_publish`,
              {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ creation_id: container.id, access_token: token }),
              }
            )
            const published = await publishRes.json() as { id?: string }
            platformPostId = published.id
          }
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
      await prisma.post.update({ where: { id: postId }, data: { status: 'FAILED' } })
      throw err
    }
  },
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`Post ${job?.data.postId} failed:`, err)
})

export default worker
