export const DEV_AUTH_COOKIE = 'booting_dev_auth'

export function isDevAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
  )
}

export function getDevAuthCookieValue(): string {
  return '1'
}

