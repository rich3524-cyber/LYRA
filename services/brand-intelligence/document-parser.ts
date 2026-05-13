import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-southeast-2',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

// Fetches a brand guidelines document from S3 and returns its text content.
// Supports plain text and basic extraction from simple formats.
export async function parseGuidelinesDocument(s3Key: string): Promise<string> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key:    s3Key,
    })
  )

  const body = res.Body
  if (!body) return ''

  // Stream to buffer
  const chunks: Uint8Array[] = []
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  // For text files return directly; for PDFs return raw text extraction
  const contentType = res.ContentType ?? ''
  if (contentType.includes('text/') || s3Key.endsWith('.txt') || s3Key.endsWith('.md')) {
    return buffer.toString('utf-8').slice(0, 10000)
  }

  // For other formats, return the text portion as best-effort
  return buffer.toString('utf-8', 0, Math.min(buffer.length, 10000)).replace(/[^\x20-\x7E\n]/g, ' ')
}

// Fetches all guidelines documents for a workspace from S3 and concatenates them.
export async function parseWorkspaceGuidelines(guidelineUrls: string[]): Promise<string> {
  if (guidelineUrls.length === 0) return ''

  const texts = await Promise.allSettled(
    guidelineUrls.map((url) => {
      // Strip bucket prefix if present to get the S3 key
      const key = url.includes('.amazonaws.com/')
        ? url.split('.amazonaws.com/')[1]
        : url
      return parseGuidelinesDocument(key)
    })
  )

  return texts
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value)
    .join('\n\n---\n\n')
    .slice(0, 8000)
}
