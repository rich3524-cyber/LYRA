/**
 * Whether a comment was posted by one of the workspace's own connected
 * accounts, and so must not be treated as incoming or answered by the AI.
 *
 * Three ingestion paths each grew their own version of this check --
 * app/api/zernio/webhook (isOwner + platformId + handle + name),
 * workers/comment-monitor.worker.ts and services/comments/sync.ts (name +
 * handle only). They drifted, and the weakest one let the AI draft a reply
 * to the account's own reply on 2026-07-22. This is the one implementation
 * all three now share.
 *
 * The important change beyond consolidation: identities is every account in
 * the workspace, not just the one that owns the post. On 2026-11-07 LYRA
 * publicly replied to its own sister brand twice -- "Lyra Online Social"
 * commenting on an Into The Wild post is a different account, so every
 * single-account check (isOwner included) correctly said "not self" and let
 * it through. An operator running several brands from one workspace sees
 * that as the product talking to itself.
 */
export interface AccountIdentity {
  platformId?: string | null
  handle?: string | null
  name?: string | null
}

export interface CommentAuthor {
  /** Zernio's own flag, authoritative when present but only ever about the fetching account. */
  isOwner?: boolean | null
  id?: string | null
  username?: string | null
  name?: string | null
}

function norm(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

export function isSelfComment(
  author: CommentAuthor | null | undefined,
  identities: AccountIdentity[]
): boolean {
  if (!author) return false
  if (author.isOwner === true) return true

  const authorId     = norm(author.id)
  const authorHandle = norm(author.username)
  const authorName   = norm(author.name)

  // A comment with no identifying field at all must not match an account
  // whose own field is also blank -- that would silently drop every
  // anonymous commenter the moment one account had no handle set.
  // Tolerates a missing list rather than throwing: this runs inside comment
  // ingestion, and a crash here would fail the whole sync for an account --
  // a far worse outcome than failing to filter one self-comment.
  return (identities ?? []).some((identity) => {
    const id     = norm(identity.platformId)
    const handle = norm(identity.handle)
    const name   = norm(identity.name)
    return (
      (authorId !== null && id !== null && authorId === id) ||
      (authorHandle !== null && handle !== null && authorHandle === handle) ||
      (authorName !== null && name !== null && authorName === name)
    )
  })
}
