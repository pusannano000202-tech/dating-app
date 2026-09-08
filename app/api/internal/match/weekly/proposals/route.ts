import { createHash } from 'node:crypto'

import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import {
  buildWeeklyAllocationPlan,
  type WeeklyAllocationApplication,
  type WeeklyAllocationInput,
} from '@/lib/matching/weekly-allocation-core'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import {
  TonightApiInputError,
  asUuid,
  readStrictJson,
  tonightInputErrorResponse,
} from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  const secret = process.env.CONTINUATION_INTERNAL_SECRET || process.env.CRON_SECRET
  if (!secret || !isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return continuationJson({ error: 'forbidden' }, 403)
  }
  try {
    const body = await readStrictJson(request, ['window_id', 'idempotency_key'])
    const windowId = asUuid(body.window_id, 'window_id')
    const idempotencyKey = asUuid(body.idempotency_key, 'idempotency_key')
    const service = createPaymentServiceClient()
    if (!service) return continuationJson({ error: 'service_unavailable' }, 503)

    const { data: allocatorData, error: allocatorError } = await service.rpc(
      'service_get_weekly_allocator_input',
      { p_window_id: windowId },
    )
    if (allocatorError) return continuationRpcErrorResponse(allocatorError)
    const allocationInput = parseAllocatorInput(allocatorData)
    if (!allocationInput) return continuationJson({ error: 'invalid_allocator_input' }, 409)
    const allocation = buildWeeklyAllocationPlan(allocationInput)
    if (allocation.status === 'budget_exhausted') {
      return continuationJson({ error: 'allocation_budget_exhausted', retryable: true }, 503)
    }
    if (allocation.status === 'invalid_input') {
      return continuationJson({ error: 'invalid_allocator_input' }, 409)
    }
    if (allocation.status === 'no_assignments') {
      return continuationJson({
        status: 'no_assignments',
        window_id: windowId,
        unassigned_application_count: allocation.unassignedApplicationIds.length,
      })
    }

    const assignmentPlan = allocation.rooms.map((room) => ({
      people_count: room.peopleCount,
      applications: room.applications.map((application) => ({
        application_id: application.applicationId,
        expected_revision: application.expectedRevision,
        assignment_idempotency_key: deterministicUuid(
          `${idempotencyKey}:${windowId}:${application.applicationId}`,
        ),
      })),
    }))
    const inputSnapshotHash = createHash('sha256')
      .update(JSON.stringify(allocatorData))
      .digest('hex')
    const { data, error } = await service.rpc('service_create_weekly_allocation_proposal', {
      p_window_id: windowId,
      p_expected_window_revision: allocationInput.window.revision,
      p_school_scope_key: allocationInput.window.schoolScopeKey,
      p_assignment_plan: assignmentPlan,
      p_input_snapshot_hash: inputSnapshotHash,
      p_idempotency_key: idempotencyKey,
    })
    return error ? continuationRpcErrorResponse(error) : continuationJson(data, 201)
  } catch (error) {
    return error instanceof TonightApiInputError
      ? tonightInputErrorResponse(error)
      : continuationJson({ error: 'invalid_request' }, 400)
  }
}

function parseAllocatorInput(value: unknown): WeeklyAllocationInput | null {
  const root = record(value)
  const window = record(root?.window)
  if (!root || !window || !Array.isArray(root.applications)) return null
  const applications: WeeklyAllocationApplication[] = []
  for (const value of root.applications) {
    const application = record(value)
    if (!application || !Array.isArray(application.members)) return null
    const members: WeeklyAllocationApplication['members'] = []
    for (const value of application.members) {
      const member = record(value)
      if (!member) return null
      members.push({
        participantUserId: text(member.participant_user_id),
        gender: member.gender === 'female' ? 'female' : member.gender === 'male' ? 'male' : '' as 'male',
        schoolScopeKey: text(member.school_scope_key),
        departmentKey: text(member.department_key),
      })
    }
    applications.push({
      applicationId: text(application.application_id),
      revision: integer(application.revision),
      partySize: integer(application.party_size),
      acceptedMemberCount: integer(application.accepted_member_count),
      members,
    })
  }
  return {
    window: {
      windowId: text(window.window_id),
      revision: integer(window.revision),
      schoolScopeKey: text(window.school_scope_key),
      capacity: integer(window.capacity),
    },
    applications,
  }
}

function deterministicUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  const joined = hex.join('')
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function integer(value: unknown): number {
  return Number.isInteger(value) ? value as number : -1
}
