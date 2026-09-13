import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { mapWeeklyAvailabilityRpcError, parseWeeklyPartyConsentInput } from '@/lib/matching/weekly-availability'
import { TonightApiInputError, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { datingAdmissionFailure } from '@/lib/relationship/contract'

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, [
      'application_id',
      'decision',
      'expected_revision',
      'idempotency_key',
    ])
    const parsed = parseWeeklyPartyConsentInput(body)
    if (!parsed.ok) throw new TonightApiInputError('invalid_field', parsed.error)

    const supabase = createSupabaseRequestClient(request)
    if (parsed.value.decision === 'accept') {
      const admissionFailure = await datingAdmissionFailure(supabase)
      if (admissionFailure) return continuationJson({ error: admissionFailure.error }, admissionFailure.status)
    }
    const { data, error } = await supabase.rpc('set_my_weekly_party_consent', {
      p_application_id: parsed.value.applicationId,
      p_decision: parsed.value.decision,
      p_expected_revision: parsed.value.expectedRevision,
      p_idempotency_key: parsed.value.idempotencyKey,
    })
    if (error) {
      const mapped = mapWeeklyAvailabilityRpcError(error)
      return mapped ? continuationJson({ error: mapped.error }, mapped.status) : continuationRpcErrorResponse(error)
    }
    return continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
