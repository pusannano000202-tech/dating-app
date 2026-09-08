import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  asIdempotencyKey,
  asInteger,
  asRequiredString,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, [
      'team_id', 'user_id', 'status', 'expected_revision', 'idempotency_key',
    ])
    const status = asRequiredString(body.status, 'status', {
      maxLength: 16,
      pattern: /^(?:pending|arrived|no_show|excused)$/,
    })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_set_tonight_attendance', {
      p_team_id: asUuid(body.team_id, 'team_id'),
      p_user_id: asUuid(body.user_id, 'user_id'),
      p_status: status,
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
        min: 0,
        max: 2_147_483_647,
      }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    if (!Number.isInteger(data) || (data as number) < 0) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    return privateJson({ attendance_revision: data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
