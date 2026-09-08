import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asOptionalUuid, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

const REPORT_CATEGORIES = new Set(['safety', 'harassment', 'no_show', 'venue', 'other'])

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const body = await readStrictJson(request, [
      'team_id', 'subject_user_id', 'category', 'description', 'idempotency_key',
    ])
    const category = asRequiredString(body.category, 'category', { maxLength: 32, pattern: /^[a-z_]+$/ })
    if (!REPORT_CATEGORIES.has(category)) return privateJson({ error: 'invalid_request', field: 'category' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('submit_tonight_incident_report', {
      p_team_id: asUuid(body.team_id, 'team_id'),
      p_subject_user_id: asOptionalUuid(body.subject_user_id, 'subject_user_id'),
      p_category: category,
      p_description: asRequiredString(body.description, 'description', { minLength: 2, maxLength: 1000 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ report_id: data }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
