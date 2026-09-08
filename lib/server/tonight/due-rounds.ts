const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const TONIGHT_DUE_ROUND_BATCH_SIZE = 20

export type TonightDueRoundStage = 'allocation' | 'deposit' | 'partner_acceptance'

export type TonightDueRound = {
  id: string
  serviceDate: string
}

export type TonightDueRoundPolicy = {
  deadlineColumn: 'allocation_publish_at' | 'deposit_due_at' | 'partner_acceptance_due_at'
  eligibleStatuses: string[]
  mustFinishBeforeColumn: 'deposit_due_at' | null
  nowIso: string
  limit: number
}

export function getTonightDueRoundPolicy(
  stage: TonightDueRoundStage,
  now = new Date(),
): TonightDueRoundPolicy {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_clock')

  const shared = {
    nowIso: now.toISOString(),
    limit: TONIGHT_DUE_ROUND_BATCH_SIZE,
  }
  if (stage === 'allocation') {
    return {
      deadlineColumn: 'allocation_publish_at',
      eligibleStatuses: ['open'],
      mustFinishBeforeColumn: 'deposit_due_at',
      ...shared,
    }
  }
  if (stage === 'deposit') {
    return {
      deadlineColumn: 'deposit_due_at',
      eligibleStatuses: ['open', 'allocation_locked', 'awaiting_deposits'],
      mustFinishBeforeColumn: null,
      ...shared,
    }
  }
  return {
    deadlineColumn: 'partner_acceptance_due_at',
    eligibleStatuses: ['awaiting_deposits', 'partner_confirmation'],
    mustFinishBeforeColumn: null,
    ...shared,
  }
}

export function parseDueTonightRounds(value: unknown): TonightDueRound[] {
  if (!Array.isArray(value) || value.length > TONIGHT_DUE_ROUND_BATCH_SIZE) {
    throw new Error('invalid_due_round_rows')
  }

  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('invalid_due_round_row')
    }
    const row = candidate as Record<string, unknown>
    if (
      typeof row.id !== 'string'
      || !UUID_PATTERN.test(row.id)
      || typeof row.service_date !== 'string'
      || !isExactServiceDate(row.service_date)
    ) {
      throw new Error('invalid_due_round_row')
    }
    return { id: row.id, serviceDate: row.service_date }
  })
}

function isExactServiceDate(value: string): boolean {
  if (!SERVICE_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const normalized = new Date(Date.UTC(year, month - 1, day))
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day
}
