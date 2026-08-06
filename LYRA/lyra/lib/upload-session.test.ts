import { describe, it, expect, vi, beforeEach } from 'vitest'

const multiMock = {
  hset: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(),
}
// Each chain method returns `this` so `.multi().hset().expire().expire().exec()` composes.
multiMock.hset.mockReturnValue(multiMock)
multiMock.expire.mockReturnValue(multiMock)
multiMock.exec.mockResolvedValue([])

vi.mock('@/lib/redis', () => ({
  redisClient: {
    set: vi.fn(),
    get: vi.fn(),
    hset: vi.fn(),
    hgetall: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
    multi: vi.fn(() => multiMock),
  },
}))

import { redisClient } from '@/lib/redis'
import {
  createUploadSession,
  getUploadSessionMeta,
  recordPart,
  getReceivedParts,
  deleteUploadSession,
  type UploadSessionMeta,
} from './upload-session'

const SAMPLE_META: UploadSessionMeta = {
  s3Key: 'media/ws-1/file.mp4',
  s3UploadId: 'real-upload-id-123',
  workspaceId: 'ws-1',
  userId: 'user-1',
  contentType: 'video/mp4',
  totalSizeBytes: 12_000_000,
  chunkSizeBytes: 6_000_000,
  expectedParts: 2,
}

describe('upload-session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    multiMock.hset.mockReturnValue(multiMock)
    multiMock.expire.mockReturnValue(multiMock)
    multiMock.exec.mockResolvedValue([])
  })

  it('createUploadSession stores the meta as JSON with a 24-hour expiry', async () => {
    await createUploadSession('upload-1', SAMPLE_META)
    expect(redisClient.set).toHaveBeenCalledWith(
      'media-upload:upload-1:meta',
      JSON.stringify(SAMPLE_META),
      'EX',
      24 * 60 * 60
    )
  })

  it('getUploadSessionMeta returns null when the session does not exist', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null)
    const result = await getUploadSessionMeta('missing')
    expect(result).toBeNull()
  })

  it('getUploadSessionMeta parses and returns stored meta', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(SAMPLE_META))
    const result = await getUploadSessionMeta('upload-1')
    expect(result).toEqual(SAMPLE_META)
  })

  it('getUploadSessionMeta returns null instead of throwing when the stored value is malformed JSON', async () => {
    vi.mocked(redisClient.get).mockResolvedValue('{not valid json')
    const result = await getUploadSessionMeta('upload-1')
    expect(result).toBeNull()
  })

  it('getUploadSessionMeta returns null when the parsed object is missing a required field', async () => {
    const { expectedParts: _expectedParts, ...incomplete } = SAMPLE_META
    vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(incomplete))
    const result = await getUploadSessionMeta('upload-1')
    expect(result).toBeNull()
  })

  it('recordPart writes the etag and refreshes both the parts and meta TTLs atomically via MULTI/EXEC', async () => {
    await recordPart('upload-1', 0, '"etag-for-part-0"')
    expect(redisClient.multi).toHaveBeenCalledTimes(1)
    expect(multiMock.hset).toHaveBeenCalledWith('media-upload:upload-1:parts', '0', '"etag-for-part-0"')
    expect(multiMock.expire).toHaveBeenCalledWith('media-upload:upload-1:parts', 24 * 60 * 60)
    expect(multiMock.expire).toHaveBeenCalledWith('media-upload:upload-1:meta', 24 * 60 * 60)
    expect(multiMock.exec).toHaveBeenCalledTimes(1)
  })

  it('getReceivedParts returns all hash fields as a flat key-value object', async () => {
    vi.mocked(redisClient.hgetall).mockResolvedValue({ '0': '"etag-0"', '1': '"etag-1"' })
    const result = await getReceivedParts('upload-1')
    expect(result).toEqual({ 0: '"etag-0"', 1: '"etag-1"' })
  })

  it('getReceivedParts returns an empty object when no parts have been recorded', async () => {
    vi.mocked(redisClient.hgetall).mockResolvedValue({})
    const result = await getReceivedParts('upload-1')
    expect(result).toEqual({})
  })

  it('deleteUploadSession removes both the meta key and the parts hash', async () => {
    await deleteUploadSession('upload-1')
    expect(redisClient.del).toHaveBeenCalledWith('media-upload:upload-1:meta', 'media-upload:upload-1:parts')
  })
})
