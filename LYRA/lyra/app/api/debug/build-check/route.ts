import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Broad cache bust — wipes Full Route Cache for all workspace pages
  revalidatePath('/workspace', 'layout')

  return NextResponse.json({
    commit: '706362b',
    ts: new Date().toISOString(),
    brand_component: 'BrandGuidelinesPanel',
    revalidated: true,
  })
}
