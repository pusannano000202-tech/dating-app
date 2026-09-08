import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asInteger,
  asRequiredString,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

const SCHOOL_SCOPE_KEY = 'pnu_self_selected'
const CAPABILITIES = ['weekly_allocation:review', 'weekly_allocation:execute'] as const

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
      checkMutationOrigin: false,
    })
    const params = new URL(request.url).searchParams
    const operatorUserId = asUuid(params.get('operator_user_id'), 'operator_user_id')
    const capability = asCapability(params.get('capability'))
    const { data, error } = await createSupabaseRequestClient(request).rpc(
      'super_admin_get_weekly_allocation_operator_grant',
      {
        p_operator_user_id: operatorUserId,
        p_school_scope_key: SCHOOL_SCOPE_KEY,
        p_capability: capability,
      },
    )
    return error ? tonightRpcErrorResponse(error) : privateJson(data)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
      checkMutationOrigin: true,
    })
    const body = await readStrictJson(request, [
      'operator_user_id', 'capability', 'enabled', 'expected_revision', 'idempotency_key',
    ])
    const { data, error } = await createSupabaseRequestClient(request).rpc(
      'super_admin_set_weekly_allocation_operator_grant',
      {
        p_operator_user_id: asUuid(body.operator_user_id, 'operator_user_id'),
        p_school_scope_key: SCHOOL_SCOPE_KEY,
        p_capability: asCapability(body.capability),
        p_enabled: asStrictBoolean(body.enabled),
        p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
          min: 0,
          max: 2_147_483_647,
        }),
        p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
      },
    )
    return error ? tonightRpcErrorResponse(error) : privateJson(data)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

function asCapability(value: unknown): typeof CAPABILITIES[number] {
  const capability = asRequiredString(value, 'capability', { maxLength: 40 })
  if (!CAPABILITIES.includes(capability as typeof CAPABILITIES[number])) {
    throw new TonightApiInputError('invalid_field', 'capability')
  }
  return capability as typeof CAPABILITIES[number]
}

function asStrictBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TonightApiInputError('invalid_field', 'enabled')
  return value
}
