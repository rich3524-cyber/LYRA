import { config } from 'dotenv'

// The production key is supplied through LYRA_ENCRYPTION_KEY_OVERRIDE so it
// never has to be written to disk. lyra/.env.local points DATABASE_URL at the
// PRODUCTION database while holding a non-production ENCRYPTION_KEY (see
// LYRA-Data-Register.md section 5.5), so pasting the real key in there leaves a
// production credential in a file that is already a footgun.
//
// A DISTINCT variable name, not ENCRYPTION_KEY, and that is not cosmetic.
// ENCRYPTION_KEY is unusable as an override signal here for two compounding
// reasons:
//
//  1. This directory has BOTH .env and .env.local, and both define
//     ENCRYPTION_KEY (to different values, neither of them production's).
//  2. ESM hoists every import declaration above all statements, and importing
//     @prisma/client auto-loads .env. So by the time any statement in this file
//     runs, process.env.ENCRYPTION_KEY is ALREADY populated from .env.
//
// An earlier version read process.env.ENCRYPTION_KEY here intending "did the
// caller pass one?", got .env's value every time, reported it as coming from
// the shell, and re-applied it over .env.local's -- silently preferring the
// older file. Reading a name nothing else sets avoids the whole ordering
// question rather than trying to reason about it.
const overrideKey = process.env.LYRA_ENCRYPTION_KEY_OVERRIDE
config({ path: '.env.local', override: true })
if (overrideKey) {
  process.env.ENCRYPTION_KEY = overrideKey
  console.log('Using ENCRYPTION_KEY from LYRA_ENCRYPTION_KEY_OVERRIDE (not from .env or .env.local).')
} else {
  console.log('Using ENCRYPTION_KEY from .env.local (override: true, so it beats .env).')
}

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// lib/encrypt.ts captures process.env.ENCRYPTION_KEY into a module-level const
// at load time, so it MUST NOT be imported until the key above is settled.
// Imported dynamically inside main() for that reason -- a static import here
// would bind whichever value happened to be present when the module graph
// loaded, which under some module semantics is before the dotenv call above.
type Crypto = typeof import('../lib/encrypt')

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
// Usage (run from LYRA/lyra, so .env.local and ../lib resolve). The production
// ENCRYPTION_KEY is supplied for one command rather than written to disk;
// Read-Host keeps it out of shell history, unlike an inline assignment:
//
//   PowerShell:
//     $env:LYRA_ENCRYPTION_KEY_OVERRIDE = Read-Host "Paste production ENCRYPTION_KEY"
//     npx tsx scripts/encrypt-email-integration-keys.ts            # dry run
//     npx tsx scripts/encrypt-email-integration-keys.ts --apply
//     Remove-Item Env:\LYRA_ENCRYPTION_KEY_OVERRIDE
//
// Everything other than ENCRYPTION_KEY still comes from .env.local. The script
// never prints key material -- only lengths and a verdict per row.

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

async function assertKeyMatchesProduction(decrypt: Crypto['decrypt']) {
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
    `The key in use (${overrideKey ? 'from LYRA_ENCRYPTION_KEY_OVERRIDE' : 'from .env.local'}) is ` +
    'not the one production used.\nEncrypting with it would make these credentials unreadable ' +
    'to the deployed app AND\noverwrite the plaintext. Refusing to continue.\n\n' +
    'Fix: take ENCRYPTION_KEY from the Netlify environment variables for lyra-online-app\n' +
    '(it must match Railway\'s too) and pass it for one command, rather than writing it\n' +
    'into .env.local -- which points at the production database while holding a\n' +
    'non-production key (LYRA-Data-Register.md section 5.5):\n\n' +
    '  $env:LYRA_ENCRYPTION_KEY_OVERRIDE = Read-Host "Paste production ENCRYPTION_KEY"\n' +
    '  npx tsx scripts/encrypt-email-integration-keys.ts\n' +
    '  npx tsx scripts/encrypt-email-integration-keys.ts --apply\n' +
    '  Remove-Item Env:\\LYRA_ENCRYPTION_KEY_OVERRIDE\n\n' +
    'Read-Host keeps the value out of shell history, unlike assigning it inline.'
  )
}

async function main() {
  const apply = process.argv.includes('--apply')

  // Format first -- a malformed key would otherwise fail the import below with
  // a less specific error.
  assertKeyWellFormed()

  const { encrypt, decrypt } = await import('../lib/encrypt')

  // Runs in dry-run mode too, so a key problem is discovered before --apply
  // rather than during it.
  await assertKeyMatchesProduction(decrypt)

  const integrations = await prisma.emailIntegration.findMany({
    select: { id: true, provider: true, workspaceId: true, isActive: true, lastSyncAt: true, apiKey: true },
  })

  console.log(`${integrations.length} EmailIntegration row(s).`)
  console.log(apply ? 'Mode: APPLY (will write)\n' : 'Mode: DRY RUN (no writes -- pass --apply to migrate)\n')

  // apiKey is nullable: null means the integration was disconnected and its
  // credential deleted, which is the desired end state, not something to
  // migrate. Narrowed to a non-null apiKey so the write below type-checks
  // without a cast.
  const plaintext: (Omit<(typeof integrations)[number], 'apiKey'> & { apiKey: string })[] = []

  for (const row of integrations) {
    if (row.apiKey === null) {
      console.log(
        `  ${row.id}  ${row.provider.padEnd(10)} active=${String(row.isActive).padEnd(5)} ` +
        'no stored credential (disconnected)'
      )
      continue
    }

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

    if (!encrypted) plaintext.push({ ...row, apiKey: row.apiKey })
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
    // A null apiKey is a deleted credential, not an unencrypted one.
    if (row.apiKey === null) return false
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
