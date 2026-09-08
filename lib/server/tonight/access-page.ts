type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function membershipId(value: UnknownRecord): string {
  return typeof value.membership_id === 'string' ? value.membership_id : ''
}

function normalizeMembershipPage(rowsValue: unknown, limit = 50): {
  memberships: UnknownRecord[]
  nextAfterMembershipId: string | null
} {
  const boundedLimit = Math.min(Math.max(Number.isSafeInteger(limit) ? limit : 50, 1), 50)
  const rows = Array.isArray(rowsValue)
    ? rowsValue.map(asRecord).filter((row) => membershipId(row))
    : []
  const memberships = rows.slice(0, boundedLimit)
  return {
    memberships,
    nextAfterMembershipId: rows.length > boundedLimit
      ? membershipId(memberships.at(-1) ?? {}) || null
      : null,
  }
}

export function normalizeTonightMarketMembershipPage(rowsValue: unknown, limit = 50) {
  return normalizeMembershipPage(rowsValue, limit)
}

export function normalizeTonightPartnerMembershipPage(rowsValue: unknown, limit = 50) {
  return normalizeMembershipPage(rowsValue, limit)
}
