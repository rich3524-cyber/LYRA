import { createHmac, timingSafeEqual } from 'crypto'

// Falls back to AUTH0_SECRET (already required for the app to run at all) so this
// works without any new env var setup -- but a dedicated OAUTH_STATE_SECRET is the
// correct long-term setup since it keeps this signing key isolated from session
// encryption. Set one in Netlify/Railway when convenient.
const SECRET = process.env.OAUTH_STATE_SECRET || process.env.AUTH0_SECRET!

// Long enough to cover a slow human clicking through a platform's consent screen,
// short enough that a leaked/logged state value isn't useful for long.
const MAX_AGE_MS = 10 * 60 * 1000

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

/** Encodes `data` plus an issued-at timestamp into a signed, tamper-evident state string. */
export function signState(data: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify({ ...data, iat: Date.now() })).toString('base64url')
  return `${encoded}.${sign(encoded)}`
}

/**
 * Verifies signature and expiry, returning the decoded payload or null if the
 * state was missing, forged, malformed, or expired. Callers must treat null as
 * "reject this callback" -- this is the actual CSRF defense, not just parsing.
 */
export function verifyState<T extends Record<string, unknown>>(raw: string | null): T | null {
  if (!raw) return null
  const [encoded, sig] = raw.split('.')
  if (!encoded || !sig) return null

  const expected = sign(encoded)
  const actual = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T & { iat: number }
    if (typeof payload.iat !== 'number' || Date.now() - payload.iat > MAX_AGE_MS) return null
    return payload
  } catch {
    return null
  }
}
