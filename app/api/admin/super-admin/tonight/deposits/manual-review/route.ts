import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import {
  TonightApiInputError,
  asIdempotencyKey,
  asInteger,
  asRequiredString,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'
import { isTonightNoShowForfeitPolicyApproved } from '@/lib/server/tonight/deposit-resolution-policy'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
    const body = await readStrictJson(request, [
      'depositId', 'decision', 'expectedRevision', 'idempotencyKey',
    ])
    const depositId = asUuid(body.depositId, 'depositId')
    const decision = asRequiredString(body.decision, 'decision', {
      maxLength: 7,
      pattern: /^(?:refund|forfeit)$/,
    }) as 'refund' | 'forfeit'
    const expectedRevision = asInteger(body.expectedRevision, 'expectedRevision', {
      min: 0,
      max: 2_147_483_647,
    })
    const idempotencyKey = asIdempotencyKey(body.idempotencyKey)
    const forfeitPolicyApproved = isTonightNoShowForfeitPolicyApproved()
    if (decision === 'forfeit' && !forfeitPolicyApproved) {
      return privateJson({ error: 'conflict', code: 'forfeit_policy_not_approved' }, 409)
    }

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_resolve_tonight_manual_deposit', {
      p_deposit_id: depositId,
      p_decision: decision,
      p_expected_revision: expectedRevision,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return tonightRpcErrorResponse(error)
    if (!isResolutionResult(data, depositId, decision)) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    return privateJson(data)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

function isResolutionResult(
  value: unknown,
  depositId: string,
  decision: 'refund' | 'forfeit',
): value is {
  deposit_id: string
  decision: 'refund' | 'forfeit'
  deposit_revision: number
  refund_request_id: string | null
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.deposit_id === depositId
    && row.decision === decision
    && Number.isInteger(row.deposit_revision)
    && (row.deposit_revision as number) > 0
    && (
      decision === 'forfeit'
        ? row.refund_request_id === null
        : typeof row.refund_request_id === 'string'
    )
}
