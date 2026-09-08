import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
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
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['admin', 'super_admin'],
      checkMutationOrigin: false,
    })
    const proposalId = asUuid(new URL(request.url).searchParams.get('proposal_id'), 'proposal_id')
    const { data, error } = await createSupabaseRequestClient(request).rpc(
      'operator_get_weekly_allocation_proposal',
      { p_proposal_id: proposalId },
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
      allowedRoles: ['admin', 'super_admin'],
      checkMutationOrigin: true,
    })
    const body = await readStrictJson(request, [
      'action', 'proposal_id', 'expected_revision', 'idempotency_key',
    ])
    const action = asRequiredString(body.action, 'action', { maxLength: 24 })
    const proposalId = asUuid(body.proposal_id, 'proposal_id')
    const expectedRevision = asInteger(body.expected_revision, 'expected_revision', {
      min: 0,
      max: 2_147_483_647,
    })
    const idempotencyKey = asUuid(body.idempotency_key, 'idempotency_key')
    const supabase = createSupabaseRequestClient(request)

    if (action === 'review' || action === 'reject') {
      const { data, error } = await supabase.rpc('operator_review_weekly_allocation', {
        p_proposal_id: proposalId,
        p_decision: action,
        p_expected_revision: expectedRevision,
        p_idempotency_key: idempotencyKey,
      })
      return error ? tonightRpcErrorResponse(error) : privateJson(data)
    }
    if (action !== 'execute') throw new TonightApiInputError('invalid_field', 'action')

    const { data: requestData, error: requestError } = await supabase.rpc(
      'operator_request_weekly_allocation_execute',
      {
        p_proposal_id: proposalId,
        p_expected_revision: expectedRevision,
        p_idempotency_key: idempotencyKey,
      },
    )
    if (requestError) return tonightRpcErrorResponse(requestError)
    const executeRevision = readRevision(requestData)
    if (executeRevision === null) return privateJson({ error: 'service_unavailable' }, 503)
    const service = createPaymentServiceClient()
    if (!service) return privateJson({ error: 'service_unavailable' }, 503)
    const { data, error } = await service.rpc('service_execute_weekly_allocation_batch', {
      p_proposal_id: proposalId,
      p_expected_revision: executeRevision,
      p_idempotency_key: idempotencyKey,
    })
    return error ? tonightRpcErrorResponse(error) : privateJson(data)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

function readRevision(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const revision = (value as Record<string, unknown>).revision
  return Number.isInteger(revision) && (revision as number) >= 0 ? revision as number : null
}
