/** Bound Tonight read-only work on server and client, cancelling its transport.
 * Never use this to retry or cancel a payment/mutation whose outcome is unknown.
 */
export async function readWithDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  timeoutMs = 12_000,
): Promise<T> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  let rejectCancelled!: (reason: unknown) => void
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject })
  const cancel = (reason: unknown) => {
    rejectCancelled(reason)
    controller.abort(reason)
  }
  const onAbort = () => cancel(signal?.reason ?? new DOMException('Read cancelled', 'AbortError'))
  signal?.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => cancel(new Error('연결이 지연되고 있어요. 다시 확인해 주세요.')), timeoutMs)
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return read(controller.signal)
      }),
      cancelled,
    ])
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}
