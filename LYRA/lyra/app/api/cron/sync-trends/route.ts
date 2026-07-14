import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ queued: 0, note: 'LYRA Trend launches in Phase 3.' })
}
