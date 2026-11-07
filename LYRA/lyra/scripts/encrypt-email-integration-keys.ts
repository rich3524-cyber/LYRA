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
// Usage:
//   DRY RUN (default, writes nothing):  npx tsx scripts/encrypt-email-integration-keys.ts
//   APPLY:                              npx tsx scripts/encrypt-email-integration-keys.ts --apply
//
// Run it with production credentials in .env.local. It never prints key
// material -- only lengths and a verdict per row.
async function main() {
  const apply = process.argv.includes('--apply')

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
