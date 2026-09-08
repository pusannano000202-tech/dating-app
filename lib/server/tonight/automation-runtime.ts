const KST_OFFSET_MS = 9 * 60 * 60 * 1_000

export function getKstServiceDate(now = new Date()): string {
  if (!Number.isFinite(now.valueOf())) throw new TypeError('invalid_clock')
  return new Date(now.valueOf() + KST_OFFSET_MS).toISOString().slice(0, 10)
}
