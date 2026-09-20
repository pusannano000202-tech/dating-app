export class TonightRoundUnavailableError extends Error {
  readonly code = 'tonight_round_not_found'
  constructor() {
    super('오늘 모집이 아직 열리지 않았어요')
    this.name = 'TonightRoundUnavailableError'
  }
}

/** Called only after the HTTP adapter has accepted a successful response. */
export function isExplicitMissingTonightRound(payload: unknown): boolean {
  return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload)
    && Object.hasOwn(payload, 'round') && (payload as { round: unknown }).round === null)
}

export function isTonightRoundUnavailable(error: unknown): boolean {
  return error instanceof TonightRoundUnavailableError && error.code === 'tonight_round_not_found'
}

export class TonightAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TonightAccessError'
  }
}

/** A missing recruitment snapshot cannot prove that an existing application ended. */
export function tonightLoadFailureAction(
  snapshot: { application: { id: string } | null } | null,
  error: unknown,
): 'retain' | 'unavailable' | 'error' {
  if (error instanceof TonightAccessError) return 'error'
  if (isTonightRoundUnavailable(error)) return snapshot?.application ? 'retain' : 'unavailable'
  return snapshot ? 'retain' : 'error'
}
