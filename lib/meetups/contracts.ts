import { featuredMeetupIdeas } from '../community/catalog'
import { validateMeetupCreateInput, type MeetupCreateInput } from '../community/contracts'
import { parseMeetupScope, type MeetupScope } from '../community/department-rooms'

export type MeetupCreateV3Input = MeetupCreateInput & {
  endsAt: string | null
  scopeType: MeetupScope
  activityKey: string | null
  idempotencyKey: string
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function validateMeetupCreateV3Input(input: unknown, now = new Date()): ValidationResult<MeetupCreateV3Input> {
  const base = validateMeetupCreateInput(input, now)
  if (!base.ok) return base
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid_request' }
  const record = input as Record<string, unknown>
  const scopeType = parseMeetupScope(record.scope_type)
  if (!scopeType) return { ok: false, error: 'invalid_scope_type' }

  const activityKey = record.activity_key === null || record.activity_key === undefined || record.activity_key === ''
    ? null
    : typeof record.activity_key === 'string'
      ? record.activity_key
      : '__invalid__'
  if (activityKey && !featuredMeetupIdeas.some((idea) => idea.id === activityKey && idea.category === base.value.category)) {
    return { ok: false, error: 'invalid_activity_key' }
  }

  const endsAtValue = typeof record.ends_at === 'string' ? record.ends_at.trim() : ''
  const endsAt = new Date(endsAtValue)
  const startsAt = new Date(base.value.scheduledAt ?? '')
  const duration = endsAt.getTime() - startsAt.getTime()
  if (base.value.scheduleStatus === 'confirmed' && (!endsAtValue || Number.isNaN(endsAt.getTime()) || duration < 30 * 60 * 1000 || duration > 24 * 60 * 60 * 1000)) {
    return { ok: false, error: 'invalid_end_time' }
  }

  const idempotencyKey = typeof record.idempotency_key === 'string' ? record.idempotency_key.toLowerCase() : ''
  if (!UUID_PATTERN.test(idempotencyKey)) return { ok: false, error: 'invalid_idempotency_key' }

  return {
    ok: true,
    value: {
      ...base.value,
      endsAt: base.value.scheduleStatus === 'schedule_pending' ? null : endsAt.toISOString(),
      scopeType,
      activityKey,
      idempotencyKey,
    },
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
