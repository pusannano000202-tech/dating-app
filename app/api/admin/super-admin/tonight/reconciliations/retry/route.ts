import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  asIdempotencyKey,
  asInteger,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
    const body = await readStrictJson(request, ['jobId', 'expectedRevision', 'idempotencyKey'])
    const jobId = asUuid(body.jobId, 'jobId')
    const expectedRevision = asInteger(body.expectedRevision, 'expectedRevision', {
      min: 0,
      max: 2_147_483_647,
    })
    const idempotencyKey = asIdempotencyKey(body.idempotencyKey)

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_retry_tonight_reconciliation', {
      p_job_id: jobId,
      p_expected_revision: expectedRevision,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return tonightRpcErrorResponse(error)
    if (!Number.isInteger(data) || (data as number) < 0) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    return privateJson({ job_id: jobId, revision: data, retry_queued: true })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
