import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { hashTonightFriendInviteToken, normalizeTonightFriendInviteToken, tonightFriendInviteRpcErrorResponse } from '@/lib/server/tonight/friend-invites'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asIdempotencyKey,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
} from '@/lib/server/tonight/api-contract'

const MATCHING_CONSENT_VERSION = '2026-09-03'

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const token = normalizeTonightFriendInviteToken((await context.params).token)
    if (!token) throw new TonightApiInputError('invalid_field', 'token')
    const body = await readStrictJson(request, [
      'ranked_activity_ids', 'matching_consent_accepted', 'matching_consent_version', 'idempotency_key',
    ])
    if (body.matching_consent_accepted !== true) {
      throw new TonightApiInputError('invalid_field', 'matching_consent_accepted')
    }
    if (body.matching_consent_version !== MATCHING_CONSENT_VERSION) {
      throw new TonightApiInputError('invalid_field', 'matching_consent_version')
    }
    if (!Array.isArray(body.ranked_activity_ids) || body.ranked_activity_ids.length !== 3) {
      throw new TonightApiInputError('invalid_field', 'ranked_activity_ids')
    }
    const rankedActivityIds = body.ranked_activity_ids.map((value) => asUuid(value, 'ranked_activity_ids'))
    if (new Set(rankedActivityIds).size !== 3) {
      throw new TonightApiInputError('invalid_field', 'ranked_activity_ids')
    }
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('accept_tonight_friend_invite', {
      p_token_hash: hashTonightFriendInviteToken(token),
      p_ranked_activity_ids: rankedActivityIds,
      p_matching_consent_accepted: true,
      p_matching_consent_version: MATCHING_CONSENT_VERSION,
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightFriendInviteRpcErrorResponse(error)
    return privateJson({ application: Array.isArray(data) ? data[0] ?? null : data }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

