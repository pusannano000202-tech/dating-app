import { NextResponse } from 'next/server'
import { requireRequestAccess, requestGuardErrorResponse } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { validateDeliveryCandidate } from '@/lib/campus-eats/delivery'
import { hasDeliveryPhoto } from '@/lib/campus-eats/delivery-assets.server'
import { deliveryVerification } from '@/lib/campus-eats/delivery-verification'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: Request) {
  try { await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true }) }
  catch (error) { return requestGuardErrorResponse(error) }
  try {
    const { data, error } = await createSupabaseRequestClient(request).rpc('admin_list_delivery_candidates')
    if (error || !Array.isArray(data)) throw new Error('unavailable')
    const candidates = data.flatMap((row: unknown) => {
      const parsed = validateDeliveryCandidate(row)
      return parsed.ok ? [parsed.candidate] : []
    })
    const photoAvailability = Object.fromEntries(await Promise.all(candidates.map(async (row) => [row.id, await hasDeliveryPhoto(row.imagePath)] as const)))
    return NextResponse.json({ candidates, photoAvailability }, { headers })
  } catch {
    return NextResponse.json({ error: 'delivery_unavailable' }, { status: 503, headers })
  }
}
export async function PUT(request: Request) {
  try { await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true, checkMutationOrigin: true }) }
  catch (error) { return requestGuardErrorResponse(error) }
  const body = await request.json().catch(() => null)
  const result = validateDeliveryCandidate(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers })
  if (result.candidate.publicationStatus === 'verified'
    && (!deliveryVerification(result.candidate, new Date()).eligible || !await hasDeliveryPhoto(result.candidate.imagePath))) {
    return NextResponse.json({ error: 'delivery_publication_evidence_required' }, { status: 400, headers })
  }
  try {
    const { data, error } = await createSupabaseRequestClient(request).rpc('admin_save_delivery_candidate', { p_candidate: result.candidate, p_expected_revision: result.candidate.revision })
    if (error) return NextResponse.json({ error: error.message.includes('stale_revision') ? 'stale_revision' : 'delivery_unavailable' }, { status: error.message.includes('stale_revision') ? 409 : 503, headers })
    return NextResponse.json(data, { headers })
  } catch {
    return NextResponse.json({ error: 'delivery_unavailable' }, { status: 503, headers })
  }
}
