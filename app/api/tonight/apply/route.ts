import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { getTonightFeatureState } from '@/lib/matching/tonight-ranked/runtime'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asIdempotencyKey,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

const MATCHING_CONSENT_VERSION = '2026-09-03'

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    if (!getTonightFeatureState().applicationsOpen) return privateJson({ error: 'applications_closed' }, 409)
    const body = await readStrictJson(request, [
      'round_id', 'ranked_activity_ids', 'idempotency_key',
      'matching_consent_accepted', 'matching_consent_version',
    ])
    const matchingConsentAccepted = body.matching_consent_accepted
    const matchingConsentVersion = body.matching_consent_version
    if (matchingConsentAccepted !== true) {
      throw new TonightApiInputError('invalid_field', 'matching_consent_accepted')
    }
    if (matchingConsentVersion !== MATCHING_CONSENT_VERSION) {
      throw new TonightApiInputError('invalid_field', 'matching_consent_version')
    }
    const roundId = asUuid(body.round_id, 'round_id')
    if (!Array.isArray(body.ranked_activity_ids) || body.ranked_activity_ids.length !== 3) {
      throw new TonightApiInputError('invalid_field', 'ranked_activity_ids')
    }
    const rankedActivityIds = body.ranked_activity_ids.map((value) => asUuid(value, 'ranked_activity_ids'))
    if (new Set(rankedActivityIds).size !== 3) {
      throw new TonightApiInputError('invalid_field', 'ranked_activity_ids')
    }
    const idempotencyKey = asIdempotencyKey(body.idempotency_key)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('submit_tonight_solo_application', {
      p_round_id: roundId,
      p_ranked_activity_ids: rankedActivityIds,
      p_matching_consent_accepted: matchingConsentAccepted,
      p_matching_consent_version: matchingConsentVersion,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ application: Array.isArray(data) ? data[0] ?? null : data }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
