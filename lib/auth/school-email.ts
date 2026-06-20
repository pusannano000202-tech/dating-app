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

export function requiresSchoolEmailForPath(_path: string | null | undefined): boolean {
  return false
}

export function getPostLoginDestination({
  schoolEmailVerifiedAt: _schoolEmailVerifiedAt,
  requestedRedirect,
}: {
  schoolEmailVerifiedAt: string | null | undefined
  requestedRedirect?: string | null
}): string {
  if (isSafeLocalRedirect(requestedRedirect)) {
    return requestedRedirect
  }
  return '/profile/basic'
}
