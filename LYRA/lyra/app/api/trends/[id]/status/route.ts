import { NextResponse } from 'next/server'

export async function PATCH() {
  return NextResponse.json({ error: 'LYRA Trend launches in Phase 3.' }, { status: 503 })
}
