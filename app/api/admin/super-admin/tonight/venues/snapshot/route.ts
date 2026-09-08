import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { buildProviderSearchLinks, isAllowedProviderUrl } from '@/lib/places/provider-links'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIsoTimestamp, asNumber, asOptionalString, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    createSupabaseRequestClient(request)
    const venueId = asUuid(new URL(request.url).searchParams.get('venue_id'), 'venue_id')
    const service = createPaymentServiceClient()
    if (!service) return privateJson({ error: 'service_unavailable' }, 503)
    const { data, error } = await service
      .from('venue_snapshots')
      .select('id,venue_id,snapshot_revision,display_name,venue_category,area_label,address,address_evidence,address_verified_at,latitude,longitude,coordinate_evidence,coordinates_verified_at,naver_url,naver_link_kind,kakao_url,kakao_link_kind,created_at')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return privateJson({ error: 'service_unavailable' }, 503)
    return privateJson({ snapshots: data ?? [] })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const supabase = createSupabaseRequestClient(request)
    const body = await readStrictJson(request, [
      'venue_id', 'address_evidence', 'address_verified_at',
      'latitude', 'longitude', 'coordinate_evidence', 'coordinates_verified_at',
      'naver_url', 'naver_link_kind', 'kakao_url', 'kakao_link_kind',
    ])
    const latitude = body.latitude === undefined || body.latitude === null
      ? null
      : asNumber(body.latitude, 'latitude', { min: -90, max: 90 })
    const longitude = body.longitude === undefined || body.longitude === null
      ? null
      : asNumber(body.longitude, 'longitude', { min: -180, max: 180 })
    if ((latitude === null) !== (longitude === null)) return privateJson({ error: 'invalid_request', field: 'coordinates' }, 400)
    const coordinateEvidence = asOptionalString(body.coordinate_evidence, 'coordinate_evidence', {
      maxLength: 32,
      pattern: /^(?:geocoded-address|provider-verified|operator-verified)$/,
    })
    const verifiedAt = body.coordinates_verified_at === undefined || body.coordinates_verified_at === null
      ? null
      : asIsoTimestamp(body.coordinates_verified_at, 'coordinates_verified_at')
    if (latitude === null ? coordinateEvidence !== null || verifiedAt !== null : coordinateEvidence === null || verifiedAt === null) {
      return privateJson({ error: 'invalid_request', field: 'coordinate_evidence' }, 400)
    }
    const venueId = asUuid(body.venue_id, 'venue_id')
    const addressEvidence = asRequiredString(body.address_evidence, 'address_evidence', {
      maxLength: 32,
      pattern: /^(?:search-verified|provider-verified|operator-verified)$/,
    })
    const addressVerifiedAt = asIsoTimestamp(body.address_verified_at, 'address_verified_at')
    const naverUrl = asOptionalString(body.naver_url, 'naver_url', { maxLength: 1000 })
    const kakaoUrl = asOptionalString(body.kakao_url, 'kakao_url', { maxLength: 1000 })
    if (naverUrl && !isAllowedProviderUrl('naver', naverUrl)) return privateJson({ error: 'invalid_request', field: 'naver_url' }, 400)
    if (kakaoUrl && !isAllowedProviderUrl('kakao', kakaoUrl)) return privateJson({ error: 'invalid_request', field: 'kakao_url' }, 400)
    const naverKind = naverUrl
      ? asRequiredString(body.naver_link_kind, 'naver_link_kind', { maxLength: 8, pattern: /^(?:place|search)$/ })
      : null
    const kakaoKind = kakaoUrl
      ? asRequiredString(body.kakao_link_kind, 'kakao_link_kind', { maxLength: 8, pattern: /^(?:place|search)$/ })
      : null
    if (!naverUrl && body.naver_link_kind != null) return privateJson({ error: 'invalid_request', field: 'naver_link_kind' }, 400)
    if (!kakaoUrl && body.kakao_link_kind != null) return privateJson({ error: 'invalid_request', field: 'kakao_link_kind' }, 400)
    const service = createPaymentServiceClient()
    if (!service) return privateJson({ error: 'service_unavailable' }, 503)
    const venue = await service
      .from('venues')
      .select('name,address')
      .eq('id', venueId)
      .maybeSingle()
    if (venue.error) return privateJson({ error: 'service_unavailable' }, 503)
    if (!venue.data?.name) return privateJson({ error: 'not_found' }, 404)
    const providerLinks = buildProviderSearchLinks(
      [venue.data.name, venue.data.address].filter(Boolean).join(' '),
    )
    if (!providerLinks.naver || !providerLinks.kakao) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    const { data, error } = await supabase.rpc('create_venue_snapshot', {
      p_venue_id: venueId,
      p_address_evidence: addressEvidence,
      p_address_verified_at: addressVerifiedAt,
      p_latitude: latitude,
      p_longitude: longitude,
      p_coordinate_evidence: coordinateEvidence,
      p_coordinates_verified_at: verifiedAt,
      p_naver_url: naverUrl ?? providerLinks.naver.url,
      p_naver_link_kind: naverKind ?? providerLinks.naver.kind,
      p_kakao_url: kakaoUrl ?? providerLinks.kakao.url,
      p_kakao_link_kind: kakaoKind ?? providerLinks.kakao.kind,
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ snapshot_id: data }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
