import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'LYRA Trend launches in Phase 3.' }, { status: 503 })
}
