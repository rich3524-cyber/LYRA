import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// encrypt.ts reads process.env.ENCRYPTION_KEY once at module load, so tests
// that need a different value must vi.resetModules() and re-import.
const VALID_KEY = 'a'.repeat(64)
const ORIGINAL_KEY = process.env.ENCRYPTION_KEY

beforeEach(() => {
  process.env.ENCRYPTION_KEY = VALID_KEY
  vi.resetModules()
})

afterEach(() => {
  process.env.ENCRYPTION_KEY = ORIGINAL_KEY
  vi.resetModules()
})

async function loadEncrypt() {
  return import('./encrypt')
}

describe('encrypt/decrypt round-trip', () => {
  it('decrypts back to the original plaintext', async () => {
    const { encrypt, decrypt } = await loadEncrypt()
    expect(decrypt(encrypt('a real oauth access token'))).toBe('a real oauth access token')
  })

  it('round-trips an empty string', async () => {
    const { encrypt, decrypt } = await loadEncrypt()
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('round-trips unicode content', async () => {
    const { encrypt, decrypt } = await loadEncrypt()
    const text = 'token with emoji 🔐 and accents éàü'
    expect(decrypt(encrypt(text))).toBe(text)
  })

  it('produces a different ciphertext for the same plaintext on each call (random IV)', async () => {
    const { encrypt } = await loadEncrypt()
    const a = encrypt('same input')
    const b = encrypt('same input')
    expect(a).not.toBe(b)
  })
})

describe('decrypt tamper detection', () => {
  it('throws rather than returning corrupted plaintext when the ciphertext is altered', async () => {
    const { encrypt, decrypt } = await loadEncrypt()
    const stored = encrypt('secret value')
    // Flip the last hex character of the ciphertext portion.
    const tampered = stored.slice(0, -1) + (stored.at(-1) === '0' ? '1' : '0')
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws when the auth tag is altered', async () => {
    const { encrypt, decrypt } = await loadEncrypt()
    const stored = encrypt('secret value')
    // Tag occupies hex offsets [24, 56) -- flip a character inside it.
    const tampered = stored.slice(0, 24) + (stored[24] === '0' ? '1' : '0') + stored.slice(25)
    expect(() => decrypt(tampered)).toThrow()
  })
})

describe('ENCRYPTION_KEY validation', () => {
  it('throws when ENCRYPTION_KEY is unset', async () => {
    process.env.ENCRYPTION_KEY = ''
    vi.resetModules()
    const { encrypt } = await loadEncrypt()
    expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY must be a 64-char hex string/)
  })

  it('throws when ENCRYPTION_KEY is the wrong length', async () => {
    process.env.ENCRYPTION_KEY = 'too-short'
    vi.resetModules()
    const { encrypt } = await loadEncrypt()
    expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY must be a 64-char hex string/)
  })
})
