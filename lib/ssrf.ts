// Shared SSRF protection — apply before any fetch() on user-supplied URLs.

const PRIVATE_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,  // link-local / cloud metadata (AWS: 169.254.169.254)
  /^::1$/,
  /^fc00:/i,      // IPv6 unique local
  /^0\.0\.0\.0$/,
]

export function isPrivateAddress(hostname: string): boolean {
  return PRIVATE_PATTERNS.some(p => p.test(hostname))
}

export function assertSafeUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL not allowed')
  }
  if (isPrivateAddress(parsed.hostname)) {
    throw new Error('URL not allowed')
  }
  return parsed
}
