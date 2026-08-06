import {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Uses S3_* names, not the AWS_* equivalents -- Netlify Functions run on AWS Lambda,
// which auto-injects AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION for its own
// execution role and blocks overriding them ("reserved env var"). Reading the AWS_*
// names here silently picked up Lambda's own credentials -- valid, but with zero
// permission on our bucket -- instead of throwing, so every upload 403'd.
export const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'ap-southeast-2',
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.AWS_S3_BUCKET!

/** Returns a presigned PUT URL valid for 5 minutes. */
export async function getUploadPresignedUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(s3, command, { expiresIn: 300 })
}

/** Deletes an object from S3. */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/** Returns the object's LastModified timestamp, or null if it doesn't exist. */
export async function headObjectLastModified(key: string): Promise<Date | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return res.LastModified ?? null
  } catch {
    return null
  }
}

/** Fetches an object's full body as a Buffer. */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const chunks: Uint8Array[] = []
  // @ts-expect-error -- Body is a Node Readable in the Lambda/Node runtime this route runs in
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Uploads a Buffer directly (server-side; not a presigned client upload). */
export async function putObjectBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
}

/** Opens a real S3 multipart upload session. Returns the real S3 UploadId. */
export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }))
  if (!res.UploadId) throw new Error('S3 did not return an UploadId')
  return res.UploadId
}

/** Uploads one part of a multipart upload. partNumber is 1-indexed, per S3's convention. Returns the part's ETag. */
export async function uploadPart(key: string, s3UploadId: string, partNumber: number, body: Buffer): Promise<string> {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw new Error(`Invalid S3 part number: ${partNumber} (must be an integer 1-10000)`)
  }
  const res = await s3.send(new UploadPartCommand({
    Bucket: BUCKET, Key: key, UploadId: s3UploadId, PartNumber: partNumber, Body: body,
  }))
  if (!res.ETag) throw new Error('S3 did not return an ETag for the uploaded part')
  return res.ETag
}

/** Finalizes a multipart upload. parts must be sorted by partNumber ascending -- S3 rejects an out-of-order list. */
export async function completeMultipartUpload(
  key: string,
  s3UploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
): Promise<void> {
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: s3UploadId,
    MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
  }))
}

/** Aborts a multipart upload, discarding any parts already uploaded. Used when finalizing the upload (CompleteMultipartUpload) itself fails. */
// Not yet called -- wired into the /api/upload/multipart/complete route's
// error-handling path in a later task, so a failed completion cleans up
// immediately rather than waiting on the S3 bucket's lifecycle rule.
export async function abortMultipartUpload(key: string, s3UploadId: string): Promise<void> {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: s3UploadId }))
}
