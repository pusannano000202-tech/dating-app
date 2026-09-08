import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TonightApiInputError, asOptionalUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    for (const key of url.searchParams.keys()) {
      if (!['round_id', 'venue_id'].includes(key) || url.searchParams.getAll(key).length !== 1) {
        throw new TonightApiInputError('unexpected_field', key)
      }
    }
    const roundId = asOptionalUuid(url.searchParams.get('round_id'), 'round_id')
    const venueId = asOptionalUuid(url.searchParams.get('venue_id'), 'venue_id')
    await requireRequestAccess(request, {
      allowedRoles: ['partner'],
      ...(venueId ? { partnerVenueId: venueId } : {}),
    })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = roundId
      ? await supabase.rpc('partner_get_tonight_setup', { p_round_id: roundId })
      : await supabase.rpc('partner_get_current_tonight_setup')
    if (error) return tonightRpcErrorResponse(error)
    if (!venueId) return privateJson({ setup: data })
    if (!data || typeof data !== 'object' || Array.isArray(data)) return privateJson({ error: 'service_unavailable' }, 503)
    const setup = data as Record<string, unknown>
    const venues = Array.isArray(setup.venues)
      ? setup.venues.filter((venue) => venue && typeof venue === 'object' && (venue as Record<string, unknown>).venue_id === venueId)
      : []
    if (venues.length === 0) return privateJson({ error: 'not_found' }, 404)
    return privateJson({ setup: { ...setup, venues } })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
