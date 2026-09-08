type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function countValue(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export type TonightExceptionPagePayload = Readonly<{
  exceptions: readonly UnknownRecord[]
  nextAfterExceptionKey: string | null
  counts: Readonly<Record<string, number>>
  totalCount: number
}>

export function normalizeTonightExceptionPage(
  rowsValue: unknown,
  countsValue: unknown,
  limit = 50,
): TonightExceptionPagePayload {
  const boundedLimit = Math.min(Math.max(Number.isSafeInteger(limit) ? limit : 50, 1), 50)
  const rows = Array.isArray(rowsValue)
    ? rowsValue.map(asRecord).filter((row) => stringValue(row.exception_key))
    : []
  const hasNext = rows.length > boundedLimit
  const exceptions = rows.slice(0, boundedLimit)
  const counts: Record<string, number> = {}
  if (Array.isArray(countsValue)) {
    for (const value of countsValue) {
      const row = asRecord(value)
      const kind = stringValue(row.exception_kind)
      if (kind) counts[kind] = countValue(row.exception_count)
    }
  }
  return {
    exceptions,
    nextAfterExceptionKey: hasNext
      ? stringValue(exceptions.at(-1)?.exception_key) || null
      : null,
    counts,
    totalCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
  }
}
