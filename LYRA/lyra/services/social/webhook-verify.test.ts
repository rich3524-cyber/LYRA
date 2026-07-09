import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyZernioSignature } from './webhook-verify'

const SECRET = 'test-webhook-secret'

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyZernioSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects a body signed with the wrong secret', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, sign(body, 'wrong-secret'), SECRET)).toBe(false)
  })

  it('rejects a tampered body (signature no longer matches)', () => {
    const originalBody = JSON.stringify({ event: 'comment.received' })
    const signature = sign(originalBody)
    const tamperedBody = JSON.stringify({ event: 'comment.received', extra: 'injected' })
    expect(verifyZernioSignature(tamperedBody, signature, SECRET)).toBe(false)
  })

  it('rejects a missing signature header', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, null, SECRET)).toBe(false)
  })

  it('rejects a malformed (non-hex, wrong-length) signature without throwing', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, 'not-a-real-signature', SECRET)).toBe(false)
  })

  it('rejects an empty secret, even with a signature that would otherwise match', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    // Signed with an empty-string key -- if the guard were missing, this would
    // incorrectly verify against an accidentally-unset ZERNIO_WEBHOOK_SECRET.
    const signature = sign(body, '')
    expect(verifyZernioSignature(body, signature, '')).toBe(false)
  })
})
