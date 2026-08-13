import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_HEX = process.env.ENCRYPTION_KEY ?? ''

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(KEY_HEX, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(24 hex) + tag(32 hex) + ciphertext(hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex')
}

export function decrypt(stored: string): string {
  const key = getKey()
  const iv = Buffer.from(stored.slice(0, 24), 'hex')
  const tag = Buffer.from(stored.slice(24, 56), 'hex')
  const ciphertext = Buffer.from(stored.slice(56), 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  // Buffer.concat before decoding, not decipher.update(...).toString('utf8')
  // + decipher.final('utf8') -- calling .toString('utf8') on a partial
  // Buffer before the stream is complete risks splitting a multi-byte UTF-8
  // character across the boundary and silently corrupting it. Benign today
  // only because GCM's update() call happens to return the entire plaintext
  // in one call for typical payload sizes -- this makes it correct
  // regardless of how the underlying stream chunks the output.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
