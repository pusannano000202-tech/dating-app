type DrainDependencies<T> = {
  claim: () => Promise<T[]>
  execute: (effect: T) => Promise<void>
  finish: (effect: T, success: boolean) => Promise<boolean>
  now?: () => number
}
export async function drainVoiceEffects<T>({
  claim,
  execute,
  finish,
  now = Date.now,
}: DrainDependencies<T>) {
  const deadline = now() + 40000
  let processed = 0,
    failed = 0,
    pending = false
  for (let batch = 0; batch < 4; batch++) {
    if (now() >= deadline) {
      pending = true
      break
    }
    const effects = await claim()
    if (effects.length === 0) {
      pending = failed > 0
      break
    }
    let cursor = 0
    await Promise.all(
      Array.from({ length: Math.min(5, effects.length) }, async () => {
        while (cursor < effects.length) {
          const effect = effects[cursor++]
          let success = false
          try {
            if (now() < deadline) {
              await execute(effect)
              success = true
            }
          } catch {
            /* Retained in the durable outbox. */
          }
          let acknowledged = false
          try {
            acknowledged = await finish(effect, success)
          } catch {
            /* Lease expires and another worker retries. */
          }
          processed++
          if (!success || !acknowledged) failed++
        }
      }),
    )
    pending = failed > 0 || effects.length >= 25
    if (effects.length < 25) break
  }
  return { processed, failed, pending }
}
