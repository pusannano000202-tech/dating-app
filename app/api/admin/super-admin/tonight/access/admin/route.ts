import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertStrictSearchParams, hydrateTonightAccessMemberships } from '@/lib/server/tonight/access-directory'
import { asIdempotencyKey, asInteger, asOptionalUuid, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

type AdminAccessDto = {
  display_name: string | null
  email_hint: string | null
}

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const supabase = createSupabaseRequestClient(request)
    assertStrictSearchParams(request, ['user_id'])
    const url = new URL(request.url)
    const targetUserId = asOptionalUuid(url.searchParams.get('user_id'), 'user_id')
    const service = createPaymentServiceClient()
    if (!service) return privateJson({ error: 'service_unavailable' }, 503)

    const { data, error } = targetUserId
      ? await supabase.rpc('super_admin_get_admin_role_state', {
        p_user_id: targetUserId,
      })
      : await service
        .from('admins')
        .select('user_id,role,granted_by,granted_at,revision')
        .order('granted_at', { ascending: false })
        .limit(100)
    if (error) return privateJson({ error: 'service_unavailable' }, 503)
    const stateRows = ((data ?? []) as Array<Record<string, unknown> & { user_id: string }>).map((row) => ({
      ...row,
      is_active: targetUserId ? row.is_active === true : true,
    }))
    const hydrated = await hydrateTonightAccessMemberships(
      service,
      stateRows,
    )
    if (hydrated.error || !hydrated.data) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    const memberships: Array<(typeof hydrated.data)[number] & AdminAccessDto> = hydrated.data
    return privateJson({ memberships })
  } catch (error) {
    return error instanceof RequestGuardError
      ? requestGuardErrorResponse(error)
      : tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, ['user_id', 'role', 'expected_revision', 'idempotency_key'])
    const role = asRequiredString(body.role, 'role', { maxLength: 16, pattern: /^(?:admin|super_admin)$/ })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('grant_admin_revisioned', {
      p_user_id: asUuid(body.user_id, 'user_id'),
      p_role: role,
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
        min: 0,
        max: 2_147_483_647,
      }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ user_id: asUuid(body.user_id, 'user_id'), role, revision: data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, ['user_id', 'expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('revoke_admin_revisioned', {
      p_user_id: asUuid(body.user_id, 'user_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
        min: 1,
        max: 2_147_483_647,
      }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ revoked: true, revision: data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
