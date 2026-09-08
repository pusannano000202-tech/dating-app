export type IdempotencyAttempt = {
  fingerprint: string
  idempotencyKey: string
}

export function resolveIdempotencyAttempt(
  current: IdempotencyAttempt | null,
  fingerprint: string,
  createKey: () => string,
): IdempotencyAttempt {
  if (current?.fingerprint === fingerprint) return current
  return { fingerprint, idempotencyKey: createKey() }
}
