const MAX_FEE_PER_ATTENDEE = 100_000

export type TonightSettlementConfig = {
  feePerAttendee: number
}

/**
 * Partner fees are an operator-owned server contract. They are never accepted
 * from an HTTP request and a missing/malformed value disables finalization.
 */
export function readTonightSettlementConfig(
  env: Record<string, string | undefined> = process.env,
): TonightSettlementConfig | null {
  const raw = env.TONIGHT_PARTNER_FEE_PER_ATTENDEE
  if (typeof raw !== 'string' || !/^(?:0|[1-9]\d*)$/.test(raw)) return null
  const feePerAttendee = Number(raw)
  if (
    !Number.isSafeInteger(feePerAttendee)
    || feePerAttendee < 0
    || feePerAttendee > MAX_FEE_PER_ATTENDEE
  ) return null
  return { feePerAttendee }
}
