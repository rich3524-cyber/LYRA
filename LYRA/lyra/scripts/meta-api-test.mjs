// Meta Marketing API — 500 call test for App Review
// Run with: META_TEST_TOKEN=xxx node scripts/meta-api-test.mjs

const TOKEN = process.env.META_TEST_TOKEN
if (!TOKEN) {
  console.error('META_TEST_TOKEN is not set. Run with: META_TEST_TOKEN=xxx node scripts/meta-api-test.mjs')
  process.exit(1)
}
const TARGET = 150
const DELAY_MS = 5000 // 5s between calls to stay under rate limit

async function getAdAccount() {
  const res = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?access_token=${TOKEN}`)
  const data = await res.json()
  if (data.error) throw new Error(`Token error: ${data.error.message}`)
  if (!data.data?.length) throw new Error('No ad accounts found. Ensure this token has ads_read permission and at least one ad account exists.')
  console.log(`Found ${data.data.length} ad account(s). Using: ${data.data[0].id}`)
  return data.data[0].id
}

async function makeCall(n) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${TOKEN}`
  )
  const data = await res.json()
  if (data.error) {
    console.log(`  [${n}] FAILED — ${data.error.message}`)
    return false
  }
  return true
}

async function run() {
  console.log('Meta Marketing API — 500 call test\n')
  console.log('Finding ad account...')

  let success = 0
  let failed = 0

  console.log(`\nMaking ${TARGET} API calls at ${DELAY_MS}ms intervals (~${Math.round(TARGET * DELAY_MS / 1000)}s total)...\n`)

  for (let i = 1; i <= TARGET; i++) {
    const ok = await makeCall(i)
    if (ok) success++; else failed++

    if (i % 50 === 0) {
      const rate = ((success / i) * 100).toFixed(1)
      console.log(`  ${i}/${TARGET} — ${success} succeeded, ${failed} failed (${rate}% success rate)`)
    }

    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  const finalRate = ((success / TARGET) * 100).toFixed(1)
  console.log(`\nComplete.`)
  console.log(`Result: ${success}/${TARGET} successful — ${finalRate}% success rate`)

  if (success >= 425) {
    console.log('PASS — meets the 85% threshold required for App Review')
  } else {
    console.log('FAIL — success rate below 85%. Check token permissions and ad account access.')
  }
}

run()
