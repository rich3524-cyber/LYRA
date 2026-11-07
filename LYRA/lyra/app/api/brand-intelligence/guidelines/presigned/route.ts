import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { s3 } from '@/lib/s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

// Deliberately lower than the 50MB media ceiling. These documents are later
// pulled back down and buffered whole into memory by
// services/brand-intelligence/document-parser.ts (getObjectBuffer) inside a
// Netlify/Lambda function before being sent to Claude, so an unbounded
// document is a memory-exhaustion vector on the parse path, not just storage
// cost. 25MB comfortably covers a real brand guidelines PDF.
const MAX_SIZE = 25 * 1024 * 1024 // 25 MB
const EXPIRES_SECONDS = 300

const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`guidelines-presigned:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, filename, contentType } = await req.json() as {
      workspaceId?: unknown
      filename?: unknown
      contentType?: unknown
    }

    // Typed guards, not just truthiness: these arrive untyped from req.json(),
    // and a non-string filename reached filename.replace() below as a raw 500
    // rather than a 400. Control 05 requires type validated at the boundary.
    if (typeof workspaceId !== 'string' || !workspaceId
     || typeof filename !== 'string' || !filename
     || typeof contentType !== 'string' || !contentType) {
      return NextResponse.json({ error: 'workspaceId, filename and contentType required' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'File type not allowed. Use PDF, TXT, or DOCX.' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // randomUUID, not Date.now(), matching the media upload routes. The
    // media/ prefix of this same bucket is necessarily public-read -- social
    // platforms fetch post media by plain URL -- so if that read policy is
    // ever scoped to the bucket rather than to media/*, every object in it is
    // readable by anyone holding the key. A `${Date.now()}-${filename}` key
    // is guessable under exactly that condition: workspaceId appears in the
    // URL of every page a client sees, the filename is often obvious
    // ("brand-guidelines.pdf"), and a millisecond timestamp inside a known
    // hour is a 3.6M-candidate search. A UUID removes the guess, so these
    // documents stop depending on the bucket policy being correctly scoped.
    //
    // The sanitised filename is kept as a suffix for legibility in the S3
    // console; it adds no guessability, since reading an object needs the
    // exact key and listing the bucket needs ListBucket, which public-read
    // does not grant. Nothing renders this key -- it is stored in
    // BrandProfile.guidelineUrls and read back server-side only -- so the
    // format is free to change.
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const key          = `guidelines/${workspaceId}/${randomUUID()}-${safeFilename}`

    // Presigned POST rather than PUT so the policy can carry conditions S3
    // enforces at upload time. The previous presigned PUT had no size limit
    // of any kind -- not even a client-declared one -- so any user with write
    // access could store an arbitrarily large object and then have the parse
    // path read it into memory. Matches app/api/upload/presign/route.ts and
    // app/api/upload/media-presign/route.ts.
    //
    // Still outstanding for these files specifically: magic-byte validation
    // and malware scanning. Control 05 makes scanning mandatory for Tier C
    // AND for any file "processed by another system" -- these documents are
    // parsed and sent to Claude, so they meet that trigger twice over. That
    // is tracked separately; this change closes the size hole only.
    const { url: uploadUrl, fields } = await createPresignedPost(s3, {
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Conditions: [
        ['content-length-range', 1, MAX_SIZE],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: EXPIRES_SECONDS,
    })

    return NextResponse.json({ uploadUrl, fields, key })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/guidelines/presigned error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
