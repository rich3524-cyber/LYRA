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
      accessToken: true,
      refreshToken: true,
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

    // Dispatch-eligible (provider/zernioAccountId) is only inference -- confirm
    // against the stored token fields themselves, since a nativeProvider dispatch
    // with a null accessToken throws at call time rather than proving a secret
    // is actually held.
    const withToken = legacyAccounts.filter((a) => a.accessToken !== null || a.refreshToken !== null)
    console.log(`  Of which LYRA actually stores an OAuth token for: ${withToken.length}`)

    const byPlatform = new Map<string, number>()
    for (const a of legacyAccounts) {
      byPlatform.set(a.platform, (byPlatform.get(a.platform) ?? 0) + 1)
    }
    console.log('\n  By platform:')
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

  // Separate cross-check: services/social/oauth-connect.ts and
  // app/api/social/facebook/complete/route.ts's native `update` branches write
  // accessToken WITHOUT resetting provider/zernioAccountId. That means a row can
  // show provider='ZERNIO' with a non-null zernioAccountId (excluded from the
  // query above entirely) while still carrying a real, unused accessToken/
  // refreshToken left over from before it was migrated to Zernio custody. This
  // checks for that population directly, since it answers a different question
  // than "does getProvider() dispatch to the native path."
  const strayTokensOnZernioAccounts = await prisma.socialAccount.count({
    where: {
      provider: 'ZERNIO',
      zernioAccountId: { not: null },
      OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }],
    },
  })
  console.log(`\nCross-check: Zernio-custody accounts that ALSO still carry a stored token: ${strayTokensOnZernioAccounts}`)
  if (strayTokensOnZernioAccounts > 0) {
    console.log('  >>> These accounts show as Zernio-custody but LYRA still holds a leftover token from before migration. <<<')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
