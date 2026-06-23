export const DEV_AUTH_COOKIE = 'booting_dev_auth'

export function isDevAuthBypassEnabled(): boolean {
  const temporarySchoolDemoMode =
    process.env.NEXT_PUBLIC_BOOTING_DEMO_MODE !== 'off'

  return (
    temporarySchoolDemoMode ||
    (
      process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
    )
  )
}

export function getDevAuthCookieValue(): string {
  return '1'
}

