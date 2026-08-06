import { z } from 'zod'
import { redisClient } from '@/lib/redis'

// Session state for an in-progress S3 multipart upload, keyed by uploadId.
//
// IMPORTANT -- part-numbering convention: chunk indices recorded via
// recordPart() / returned by getReceivedParts() are 0-based (matching how a
// client naturally counts chunks starting from 0). S3's real PartNumber is
// 1-based (1-10000). Callers building a CompletedPart[] for
// CompleteMultipartUpload MUST use `chunkIndex + 1` as PartNumber, and MUST
// sort the resulting array by PartNumber ascending -- S3 requires parts to
// be supplied in ascending part-number order. Getting this wrong surfaces
// as an InvalidPart error from S3 at the very end of the upload, which is
// the most expensive place to discover it.

const uploadSessionMetaSchema = z.object({
  s3Key: z.string(),
  s3UploadId: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  contentType: z.string(),
  totalSizeBytes: z.number(),
  chunkSizeBytes: z.number(),
  expectedParts: z.number(),
})

export type UploadSessionMeta = z.infer<typeof uploadSessionMetaSchema>

const TTL_SECONDS = 24 * 60 * 60 // 24 hours

const metaKey = (uploadId: string) => `media-upload:${uploadId}:meta`
const partsKey = (uploadId: string) => `media-upload:${uploadId}:parts`

export async function createUploadSession(uploadId: string, meta: UploadSessionMeta): Promise<void> {
  await redisClient.set(metaKey(uploadId), JSON.stringify(meta), 'EX', TTL_SECONDS)
}

export async function getUploadSessionMeta(uploadId: string): Promise<UploadSessionMeta | null> {
  const raw = await redisClient.get(metaKey(uploadId))
  if (!raw) return null
  try {
    const parsed = uploadSessionMetaSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Atomic per-field write via a Redis hash -- safe even if two chunks are
// recorded concurrently, unlike a read-modify-write on a single JSON blob
// would be (which is why parts are NOT stored inside the meta JSON above).
//
// The HSET and both EXPIREs are issued as a single MULTI/EXEC transaction so
// they either all apply or none do -- a crash between separate round-trips
// could otherwise leave the parts hash with no TTL (a permanently leaked
// Redis key). Refreshing the meta key's TTL here too converts the session
// to a 24h *idle* timeout: the clock resets on every recorded part rather
// than expiring on a fixed wall-clock window that could lapse mid-upload.
// This keeps the invariant "meta always outlives parts" -- without it, meta
// (whose TTL was previously only ever set once, at creation) would reliably
// expire before parts on any upload that runs close to 24h, leaving
// getReceivedParts() returning ETags with no meta (s3Key/s3UploadId) left
// to interpret them against.
export async function recordPart(uploadId: string, chunkIndex: number, etag: string): Promise<void> {
  await redisClient
    .multi()
    .hset(partsKey(uploadId), String(chunkIndex), etag)
    .expire(partsKey(uploadId), TTL_SECONDS)
    .expire(metaKey(uploadId), TTL_SECONDS)
    .exec()
}

// Returns received parts keyed by 0-based chunk index -- see the module-level
// comment above for the required chunkIndex -> S3 PartNumber conversion
// (PartNumber = chunkIndex + 1) and the ascending-sort requirement before
// calling CompleteMultipartUpload.
export async function getReceivedParts(uploadId: string): Promise<Record<number, string>> {
  const raw = await redisClient.hgetall(partsKey(uploadId))
  const parts: Record<number, string> = {}
  for (const [chunkIndex, etag] of Object.entries(raw)) {
    parts[Number(chunkIndex)] = etag
  }
  return parts
}

export async function deleteUploadSession(uploadId: string): Promise<void> {
  await redisClient.del(metaKey(uploadId), partsKey(uploadId))
}
