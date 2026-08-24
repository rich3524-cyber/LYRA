import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Identifies SocialAccount rows still on the native (non-Zernio) custody path --
// services/social/provider/index.ts's getProvider() falls back to nativeProvider
// whenever provider !== 'ZERNIO' or zernioAccountId is null, meaning LYRA itself
// (not Zernio) holds the real OAuth token for these accounts. Read-only -- does
// not modify anything. See docs/superpowers/specs/2026-08-25-zernio-privacy-gap-design.md.
async function main() {
  const legacyAccounts = await prisma.socialAccount.findMany({
    where: {
      OR: [
        { provider: { not: 'ZERNIO' } },
        { zernioAccountId: null },
      ],
    },
    select: {
      id: true,
      platform: true,
      provider: true,
      workspaceId: true,
      isActive: true,
      createdAt: true,
    },
  })

  console.log(`Found ${legacyAccounts.length} SocialAccount row(s) still on native (non-Zernio) custody.\n`)

  if (legacyAccounts.length === 0) {
    console.log('No legacy accounts found -- every SocialAccount row is on Zernio custody.')
  } else {
    const active = legacyAccounts.filter((a) => a.isActive)
    const inactive = legacyAccounts.filter((a) => !a.isActive)

    console.log(`  Active (live, currently in use): ${active.length}`)
    console.log(`  Inactive (disconnected/dead rows): ${inactive.length}\n`)

    const byPlatform = new Map<string, number>()
    for (const a of legacyAccounts) {
      byPlatform.set(a.platform, (byPlatform.get(a.platform) ?? 0) + 1)
    }
    console.log('  By platform:')
    for (const [platform, count] of byPlatform) {
      console.log(`    ${platform}: ${count}`)
    }

    if (active.length > 0) {
      console.log('\n  Active legacy accounts (LYRA itself holds a live token for these):')
      for (const a of active) {
        console.log(`    ${a.id} -- platform ${a.platform} -- workspace ${a.workspaceId} -- provider ${a.provider} -- connected ${a.createdAt.toISOString()}`)
      }
    }
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
