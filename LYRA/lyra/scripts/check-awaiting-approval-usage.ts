import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Confirms zero live Comment rows have status AWAITING_APPROVAL before removing
// it from the CommentStatus enum -- no code path ever assigns this status (Draft
// + Approve mode writes AI_DRAFTED instead), so this is expected to return zero,
// but verify against production rather than assume. Read-only.
async function main() {
  const count = await prisma.comment.count({ where: { status: 'AWAITING_APPROVAL' } })
  console.log(`Comments with status AWAITING_APPROVAL: ${count}`)
  if (count > 0) {
    const sample = await prisma.comment.findMany({
      where: { status: 'AWAITING_APPROVAL' },
      select: { id: true, workspaceId: true, createdAt: true },
      take: 10,
    })
    console.log('Sample rows (up to 10):', sample)
    console.log('\n>>> Non-zero count found -- do NOT proceed with the enum-removal migration until this is investigated. <<<')
  } else {
    console.log('Confirmed: no live comment carries this status. Safe to remove from the enum.')
  }
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
