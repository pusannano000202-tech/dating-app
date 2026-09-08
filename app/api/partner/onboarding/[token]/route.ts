import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { hashPartnerOnboardingToken, normalizePartnerOnboardingToken, partnerOnboardingRpcError } from '@/lib/server/tonight/account-onboarding'
import { asIdempotencyKey, privateJson, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

type Context = { params: Promise<{ token: string }> }

function tokenFrom(contextToken: string): string {
  const token = normalizePartnerOnboardingToken(contextToken)
  if (!token) throw new Error('invalid_partner_invite_token')
  return token
}

export async function GET(request: Request, context: Context) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const token = tokenFrom((await context.params).token)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_tonight_partner_invite', {
      p_token_hash: hashPartnerOnboardingToken(token),
    })
    if (error) return partnerOnboardingRpcError(error)
    const invite = Array.isArray(data) ? data[0] ?? null : data
    if (!invite || typeof invite !== 'object' || invite.target_matches !== true) {
      return privateJson({ error: 'not_found' }, 404)
    }
    return privateJson({ invite })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request, context: Context) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const body = await readStrictJson(request, ['idempotency_key'])
    const token = tokenFrom((await context.params).token)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('claim_tonight_partner_invite', {
      p_token_hash: hashPartnerOnboardingToken(token),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return partnerOnboardingRpcError(error)
    return privateJson({ invite_id: data, status: 'claimed', approval_required: true })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
