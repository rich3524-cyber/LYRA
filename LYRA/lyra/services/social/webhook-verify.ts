import { createHmac, timingSafeEqual } from 'crypto'

// Zernio signs webhook deliveries with the lowercase hex HMAC-SHA256 of the raw
// request body, keyed by the configured webhook secret, sent in the
// X-Zernio-Signature header (X-Late-Signature is a legacy alias for the same
// value). timingSafeEqual requires equal-length buffers -- a malformed or
// wrong-length signature must be rejected before reaching it, not thrown from it.
export function verifyZernioSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!secret) return false
  if (!signatureHeader) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

  const actualBuf = Buffer.from(signatureHeader)
  const expectedBuf = Buffer.from(expected)
  if (actualBuf.length !== expectedBuf.length) return false

  return timingSafeEqual(actualBuf, expectedBuf)
}
