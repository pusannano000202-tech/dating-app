import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { getSeoulWeekKey, mapWeeklyAvailabilityRpcError, parseWeeklyApplicationInput } from '@/lib/matching/weekly-availability'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { datingAdmissionFailure } from '@/lib/relationship/contract'
import { TonightApiInputError, asInteger, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

function weekKeyFrom(request: Request) {
  const value = new URL(request.url).searchParams.get('week_key') ?? getSeoulWeekKey(new Date().toISOString())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || getSeoulWeekKey(`${value}T00:00:00.000Z`) !== value) {
    throw new TonightApiInputError('invalid_field', 'week_key')
  }
  return value
}

function weeklyRpcErrorResponse(error: unknown) {
  const mapped = mapWeeklyAvailabilityRpcError(error)
  return mapped ? continuationJson({ error: mapped.error }, mapped.status) : continuationRpcErrorResponse(error)
}

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_weekly_activity_discovery_v2', { p_week_key: weekKeyFrom(request) })
    if (error) return weeklyRpcErrorResponse(error)
    return continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, ['activity_id', 'week_key', 'candidate_window_ids', 'party_group_id', 'idempotency_key'])
    const parsed = parseWeeklyApplicationInput(body)
    if (!parsed.ok) throw new TonightApiInputError('invalid_field', parsed.error)
    const supabase = createSupabaseRequestClient(request)
    const admissionFailure = await datingAdmissionFailure(supabase)
    if (admissionFailure) return continuationJson({ error: admissionFailure.error }, admissionFailure.status)
    const { data, error } = await supabase.rpc('apply_to_my_weekly_activity_v2', {
      p_activity_id: parsed.value.activityId,
      p_week_key: parsed.value.weekKey,
      p_candidate_window_ids: parsed.value.candidateWindowIds,
      p_party_group_id: parsed.value.partyGroupId,
      p_idempotency_key: parsed.value.idempotencyKey,
    })
    if (error) return weeklyRpcErrorResponse(error)
    return continuationJson(data, 201)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, ['application_id', 'expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('cancel_my_weekly_activity_application_v2', {
      p_application_id: asUuid(body.application_id, 'application_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return weeklyRpcErrorResponse(error)
    return continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
