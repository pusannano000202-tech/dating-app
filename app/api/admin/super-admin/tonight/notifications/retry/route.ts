import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
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
    const body = await readStrictJson(request, [
      'failureKind', 'failureId', 'expectedRevision', 'idempotencyKey',
    ])
    const failureKind = body.failureKind
    if (failureKind !== 'in_app' && failureKind !== 'push') {
      throw new TonightApiInputError('invalid_field', 'failureKind')
    }
    const failureId = asUuid(body.failureId, 'failureId')
    const expectedRevision = asInteger(body.expectedRevision, 'expectedRevision', {
      min: 0,
      max: 2_147_483_646,
    })

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc(
      'super_admin_retry_tonight_notification_failure',
      {
        p_failure_kind: failureKind,
        p_failure_id: failureId,
        p_expected_revision: expectedRevision,
        p_idempotency_key: asIdempotencyKey(body.idempotencyKey),
      },
    )
    if (error) return tonightRpcErrorResponse(error)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }

    const result = data as Record<string, unknown>
    const revision = result.revision
    const outcome = result.outcome
    if (
      result.failure_kind !== failureKind
      || result.failure_id !== failureId
      || !Number.isInteger(revision)
      || (revision as number) < 0
      || !['retry_queued', 'resubscribe_required', 'expired'].includes(String(outcome))
      || typeof result.retry_queued !== 'boolean'
      || typeof result.resubscribe_required !== 'boolean'
      || typeof result.user_notice_queued !== 'boolean'
      || result.retry_queued !== (outcome === 'retry_queued')
      || result.resubscribe_required !== (outcome === 'resubscribe_required')
      || result.user_notice_queued !== (outcome === 'resubscribe_required')
    ) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }

    return privateJson({
      failure_kind: failureKind,
      failure_id: failureId,
      revision,
      outcome,
      retry_queued: result.retry_queued,
      resubscribe_required: result.resubscribe_required,
      user_notice_queued: result.user_notice_queued,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
