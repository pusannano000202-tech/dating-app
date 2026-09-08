import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { isSupabaseConfigured } from '@/lib/utils'
import { deliveryAvailability, validateDeliveryCandidate } from '@/lib/campus-eats/delivery'
import { hasDeliveryPhoto } from '@/lib/campus-eats/delivery-assets.server'

export const dynamic = 'force-dynamic'
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'delivery_unavailable' }, { status: 503, headers })
  try {
    const admin = createSupabaseAdminClient()
    if (!admin) throw new Error('unavailable')
    const { data, error } = await admin.rpc('list_public_delivery_candidates')
    if (error || !Array.isArray(data)) throw new Error('unavailable')
    const candidates = data.flatMap((value: unknown) => {
      const result = validateDeliveryCandidate(value)
      return result.ok ? [result.candidate] : []
    })
    const now = new Date()
    const photoChecks = await Promise.all(candidates.map((row) => hasDeliveryPhoto(row.imagePath)))
    const publishable = candidates.filter((_, index) => photoChecks[index])
    return NextResponse.json({ ...deliveryAvailability(publishable, now), checkedAt: now.toISOString(), source: 'verified_delivery_catalog' }, { headers })
  } catch { return NextResponse.json({ error: 'delivery_unavailable' }, { status: 503, headers }) }
}
