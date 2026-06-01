export const PNU_EMAIL_DOMAIN = 'pusan.ac.kr'

export function normalizeSchoolEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isPnuEmail(email: string): boolean {
  return normalizeSchoolEmail(email).endsWith(`@${PNU_EMAIL_DOMAIN}`)
}

export function isSafeLocalRedirect(path: string | null | undefined): path is string {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//'))
}

export function requiresSchoolEmailForPath(path: string | null | undefined): boolean {
  if (!isSafeLocalRedirect(path)) return false
  return path.startsWith('/group') || path.startsWith('/match')
}

export function getPostLoginDestination({
  schoolEmailVerifiedAt,
  requestedRedirect,
}: {
  schoolEmailVerifiedAt: string | null | undefined
  requestedRedirect?: string | null
}): string {
  if (isSafeLocalRedirect(requestedRedirect)) {
    if (!schoolEmailVerifiedAt && requiresSchoolEmailForPath(requestedRedirect)) {
      return `/profile/school?redirect=${encodeURIComponent(requestedRedirect)}`
    }
    return requestedRedirect
  }
  return '/profile/basic'
}
