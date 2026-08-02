import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// LYRA Trend has no functional implementation yet (services/trends/trend-syncer.ts
// and workers/trend-sync.worker.ts are stubs) — checkout is disabled to stop billing
// customers for a non-functional add-on. The original checkout implementation is in
// git history on this file; restore it once Trend actually ships.
export async function POST() {
  try {
    await requireAuth()
    return NextResponse.json(
      { error: 'LYRA Trend is not yet available. Check back soon.' },
      { status: 503 }
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/stripe/trend-checkout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
