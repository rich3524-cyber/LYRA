import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import { encrypt, decrypt } from '../lib/encrypt'

const prisma = new PrismaClient()

// One-off migration: encrypt any EmailIntegration.apiKey still stored in
// plaintext.
//
// Why this exists rather than relying on the lazy path: the self-healing
// re-encrypt in services/email-marketing/sync.ts only runs inside
// syncEmailIntegration, so a row is migrated only when it next syncs. Both
// production rows (checked 2026-11-07) were plaintext despite BOTH being
// isActive: true -- one had never synced at all (lastSyncAt null) and the
// other last synced 2026-07-20, before the field was brought in line with
// SocialAccount/SeoConnection's encrypted tokens. "Active" is therefore not
// the same as "has synced since the change", which is what the lazy path
// actually requires.
//
// decrypt() throws on any value it did not itself produce -- an undersized or
// non-hex iv+tag prefix, or a GCM auth-tag verification failure -- so there is
// no ambiguous case and no risk of double-encrypting an already-encrypted row.
// That is the same reasoning the lazy path relies on; this just applies it to
// every row at once instead of waiting for traffic.
//
// Usage (run from LYRA/lyra, so .env.local and ../lib resolve):
//   DRY RUN (default, writes nothing):  npx tsx scripts/encrypt-email-integration-keys.ts
//   APPLY:                              npx tsx scripts/encrypt-email-integration-keys.ts --apply
//
// Run it with production credentials in .env.local. It never prints key
// material -- only lengths and a verdict per row.

/**
 * Fail closed if ENCRYPTION_KEY is not the key production actually used.
 *
 * This is the one way this script could do real damage. A stale or
 * development ENCRYPTION_KEY in .env.local still "works": decrypt() throws on
 * the plaintext rows (correctly -- they ARE plaintext), and encrypt() happily
 * produces ciphertext. But it would be ciphertext under the WRONG key, so the
 * deployed app could no longer read those credentials, turning a
 * confidentiality problem into an outage -- and the original plaintext is
 * overwritten and gone.
 *
 * So prove the key first, against ciphertext production itself wrote.
 * SeoConnection tokens are written by app/api/seo/callback via encrypt(), so
 * if the key in use decrypts one of those, it is the production key.
 */
/**
 * Check the key is well-formed BEFORE testing whether it is the right one.
 *
 * getKey() in lib/encrypt.ts rejects anything that is not exactly 64 hex
 * characters, and it throws from inside encrypt()/decrypt() -- so a malformed
 * key and a merely-wrong key both surface as "decrypt failed" and look
 * identical. They need completely different fixes, so separate them here.
 * Reports only a length and a verdict, never the value.
 */
function assertKeyWellFormed() {
  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    throw new Error('ENCRYPTION_KEY is not set. Is .env.local present in LYRA/lyra?')
  }
  if (key.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY is ${key.length} characters; lib/encrypt.ts requires exactly 64 ` +
      '(32 bytes as hex).\n' +
      'A length of 66 usually means the value is wrapped in quotes that dotenv did not ' +
      'strip,\nand 65 usually means a trailing space or carriage return. Fix the ' +
      'formatting in\n.env.local and re-run -- this is a local config problem, not a ' +
      'wrong key.'
    )
  }
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY is 64 characters but is not valid hex. lib/encrypt.ts does ' +
      'Buffer.from(key, "hex"),\nwhich silently truncates on a non-hex character ' +
      'rather than failing, so this must be caught here.'
    )
  }
  console.log('ENCRYPTION_KEY is well-formed (64 hex characters).')
}

async function assertKeyMatchesProduction() {
  const candidates = [
    ...(await prisma.seoConnection.findMany({ select: { accessToken: true } })).map((r) => r.accessToken),
    ...(await prisma.socialAccount.findMany({ select: { accessToken: true } })).map((r) => r.accessToken),
  ].filter((v): v is string => typeof v === 'string' && v.length >= 56 && /^[0-9a-f]+$/.test(v))

  if (candidates.length === 0) {
    throw new Error(
      'Cannot verify ENCRYPTION_KEY: no existing encrypted value found to test against.\n' +
      'Refusing to continue -- migrating under an unverified key could write credentials\n' +
      'the deployed app cannot read, destroying the plaintext in the process.'
    )
  }

  for (const value of candidates) {
    try {
      decrypt(value)
      console.log(`ENCRYPTION_KEY verified against an existing encrypted value (${candidates.length} candidate(s) available).\n`)
      return
    } catch {
      // Try the next one -- a single undecryptable row could itself be
      // legacy/corrupt, which is not proof the key is wrong.
    }
  }

  throw new Error(
    `ENCRYPTION_KEY does not decrypt ANY of the ${candidates.length} existing encrypted value(s).\n` +
    'That means the key in .env.local is not the one production used. Encrypting with it\n' +
    'would make these credentials unreadable to the deployed app AND overwrite the\n' +
    'plaintext. Refusing to continue.\n\n' +
    'Fix: copy ENCRYPTION_KEY from the Netlify environment variables for lyra-online-app\n' +
    '(it must match Railway\'s too), then re-run.'
  )
}

async function main() {
  const apply = process.argv.includes('--apply')

  // Both run in dry-run mode too, so a key problem is discovered before
  // --apply rather than during it.
  assertKeyWellFormed()
  await assertKeyMatchesProduction()

  const integrations = await prisma.emailIntegration.findMany({
    select: { id: true, provider: true, workspaceId: true, isActive: true, lastSyncAt: true, apiKey: true },
  })

  console.log(`${integrations.length} EmailIntegration row(s).`)
  console.log(apply ? 'Mode: APPLY (will write)\n' : 'Mode: DRY RUN (no writes -- pass --apply to migrate)\n')

  const plaintext: typeof integrations = []

  for (const row of integrations) {
    let encrypted: boolean
    try {
      decrypt(row.apiKey)
      encrypted = true
    } catch {
      encrypted = false
    }

    // Length only, never the value itself.
    console.log(
      `  ${row.id}  ${row.provider.padEnd(10)} active=${String(row.isActive).padEnd(5)} ` +
      `lastSync=${row.lastSyncAt ? row.lastSyncAt.toISOString().slice(0, 10) : 'never'.padEnd(10)} ` +
      `len=${String(row.apiKey.length).padStart(4)}  ${encrypted ? 'encrypted' : 'PLAINTEXT'}`
    )

    if (!encrypted) plaintext.push(row)
  }

  console.log(`\n${plaintext.length} row(s) need encrypting.`)

  if (plaintext.length === 0) {
    console.log('Nothing to do.')
    return
  }

  if (!apply) {
    console.log('Dry run -- re-run with --apply to migrate these rows.')
    return
  }

  for (const row of plaintext) {
    // Scoped to this row's current value, so a concurrent write (a sync
    // migrating the same row through the lazy path) is never clobbered.
    const result = await prisma.emailIntegration.updateMany({
      where: { id: row.id, apiKey: row.apiKey },
      data:  { apiKey: encrypt(row.apiKey) },
    })
    console.log(
      result.count === 1
        ? `  migrated ${row.id}`
        : `  SKIPPED  ${row.id} -- value changed since it was read (already migrated elsewhere?)`
    )
  }

  // Re-read and verify rather than trusting the writes, since a silent failure
  // here leaves a credential in plaintext while reporting success.
  const after = await prisma.emailIntegration.findMany({ select: { id: true, apiKey: true } })
  const stillPlaintext = after.filter((row) => {
    try {
      decrypt(row.apiKey)
      return false
    } catch {
      return true
    }
  })

  console.log(
    stillPlaintext.length === 0
      ? '\nVerified: every EmailIntegration.apiKey now decrypts.'
      : `\nWARNING: ${stillPlaintext.length} row(s) still plaintext: ${stillPlaintext.map((r) => r.id).join(', ')}`
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
