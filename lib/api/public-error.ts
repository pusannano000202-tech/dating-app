const PUBLIC_ERROR_CODE = /^[a-z][a-z0-9_]{2,63}$/

export function toPublicErrorCode(message: unknown, fallback: string): string {
  if (typeof message !== 'string') return fallback

  const candidate = message.trim()
  return PUBLIC_ERROR_CODE.test(candidate) ? candidate : fallback
}
