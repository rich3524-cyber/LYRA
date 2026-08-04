import { callLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { wrapUntrusted } from '../untrusted-content'

interface Comment {
  id: string
  content: string
  status: string
  socialAccount: { platform: string; name: string }
}

interface ListInboxItemsParams {
  workspace_id?: string
}

// wrapUntrusted's `source` parameter is documented as static and
// caller-controlled (it is interpolated into the wrapper's attribute
// unescaped). callLyraApi does a blind `body as T` cast, so nothing enforces
// that `socialAccount.platform` really is one of the Platform enum members
// from LYRA/lyra/prisma/schema.prisma -- it's whatever the API response says.
// Route it through this fixed lookup so `source` is always one of a known,
// code-controlled set of strings rather than a value that flows unvalidated
// from the API response.
const KNOWN_PLATFORM_SOURCES: Record<string, string> = {
  FACEBOOK: 'facebook_comment',
  INSTAGRAM: 'instagram_comment',
  LINKEDIN: 'linkedin_comment',
  TIKTOK: 'tiktok_comment',
  TWITTER: 'twitter_comment',
  GOOGLE_BUSINESS: 'google_business_comment',
  YOUTUBE: 'youtube_comment',
  PINTEREST: 'pinterest_comment',
  THREADS: 'threads_comment',
  BLUESKY: 'bluesky_comment',
}

// This is the first tool that surfaces third-party content (Instagram/Facebook
// comments) into Claude's context. Comments are hostile, untrusted,
// user-generated text -- every comment's `content` field MUST go through
// wrapUntrusted before being returned, or this becomes a real
// prompt-injection vector rather than a style nit.
export async function listInboxItems(params: ListInboxItemsParams, bearerToken: string) {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  // `/api/comments` applies a `take: 100` safety cap on the underlying route
  // (see app/api/comments/route.ts in the main app), ordered by
  // `createdAt: desc`, with no truncation signal. This tool exists to surface
  // comments needing attention, so once a workspace passes 100 total
  // comments, older pending/escalated comments silently fall off the list
  // with nothing distinguishing that from "nothing else to see."
  const comments = await callLyraApi<Comment[]>('/api/comments', bearerToken, {
    workspaceId: workspace_id,
  })

  return {
    items: comments.map((c) => ({
      id: c.id,
      content: wrapUntrusted(
        c.content,
        KNOWN_PLATFORM_SOURCES[c.socialAccount.platform] ?? 'social_comment'
      ),
      status: c.status,
      platform: c.socialAccount.platform,
      accountName: c.socialAccount.name,
    })),
  }
}
