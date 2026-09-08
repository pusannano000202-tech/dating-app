export interface StableMbtiMutationRegistry {
  get(logicalMutationKey: string): string
  complete(logicalMutationKey: string): void
}

function randomSuffix(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function createStableMbtiMutationRegistry(
  createSuffix: () => string = randomSuffix,
): StableMbtiMutationRegistry {
  const ids = new Map<string, string>()
  return {
    get(logicalMutationKey: string) {
      const existing = ids.get(logicalMutationKey)
      if (existing) return existing
      const next = `mbti:${createSuffix()}`
      ids.set(logicalMutationKey, next)
      return next
    },
    complete(logicalMutationKey: string) {
      ids.delete(logicalMutationKey)
    },
  }
}
