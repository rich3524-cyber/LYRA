import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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
