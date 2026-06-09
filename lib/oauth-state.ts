import { createHmac, timingSafeEqual } from 'crypto'

// Shared HMAC-signed OAuth state. Prevents CSRF on all social and SEO OAuth callbacks.
// The state is base64url(JSON payload) + "." + HMAC-SHA256 signature.
// Any callback that receives an unsigned or tampered state is rejected.

const ALGO = 'sha256'

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) throw new Error('OAUTH_STATE_SECRET env var is required')
  return secret
}

export function signState(data: Record<string, string>): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = createHmac(ALGO, getSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyState(raw: string | null): Record<string, string> {
  if (!raw) return {}
  const dot = raw.lastIndexOf('.')
  if (dot === -1) return {}

  const payload = raw.slice(0, dot)
  const receivedSig = raw.slice(dot + 1)
  const expectedSig = createHmac(ALGO, getSecret()).update(payload).digest('base64url')

  // Constant-time comparison — prevents timing side-channel attacks
  try {
    const match = timingSafeEqual(
      Buffer.from(receivedSig, 'base64url'),
      Buffer.from(expectedSig, 'base64url'),
    )
    if (!match) return {}
  } catch {
    return {}
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}
