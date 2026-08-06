import { redisClient } from '@/lib/redis'

export interface UploadSessionMeta {
  s3Key: string
  s3UploadId: string
  workspaceId: string
  userId: string
  contentType: string
  totalSizeBytes: number
  chunkSizeBytes: number
  expectedParts: number
}

const TTL_SECONDS = 24 * 60 * 60 // 24 hours

const metaKey = (uploadId: string) => `media-upload:${uploadId}:meta`
const partsKey = (uploadId: string) => `media-upload:${uploadId}:parts`

export async function createUploadSession(uploadId: string, meta: UploadSessionMeta): Promise<void> {
  await redisClient.set(metaKey(uploadId), JSON.stringify(meta), 'EX', TTL_SECONDS)
}

export async function getUploadSessionMeta(uploadId: string): Promise<UploadSessionMeta | null> {
  const raw = await redisClient.get(metaKey(uploadId))
  if (!raw) return null
  return JSON.parse(raw) as UploadSessionMeta
}

// Atomic per-field write via a Redis hash -- safe even if two chunks are
// recorded concurrently, unlike a read-modify-write on a single JSON blob
// would be (which is why parts are NOT stored inside the meta JSON above).
export async function recordPart(uploadId: string, chunkIndex: number, etag: string): Promise<void> {
  await redisClient.hset(partsKey(uploadId), String(chunkIndex), etag)
  await redisClient.expire(partsKey(uploadId), TTL_SECONDS)
}

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
