import { isSafeLocalRedirect } from './redirect'

export const AUTH_SERVICE_RECOVERY_PATH = '/auth/service-unavailable'

const PUBLIC_LOGIN_ERRORS = new Set([
  '로그인이 취소됐어요. 다시 시도해 주세요.',
  '로그인을 완료하지 못했어요. 다시 시도해 주세요.',
])

type HeaderReader = Pick<Headers, 'get'>

export function isBrowserPageNavigation(method: string, headers: HeaderReader): boolean {
  if (method.toUpperCase() !== 'GET') return false

  if (headers.get('rsc') === '1' || headers.get('next-router-state-tree')) return true

  const accept = headers.get('accept')?.toLowerCase() ?? ''
  const fetchMode = headers.get('sec-fetch-mode')?.toLowerCase() ?? ''
  const fetchDestination = headers.get('sec-fetch-dest')?.toLowerCase() ?? ''

  return accept.includes('text/html')
    || (fetchMode === 'navigate' && (!fetchDestination || fetchDestination === 'document'))
}

export function getSafeServiceRecoveryDestination(value: string | null | undefined): string | null {
  if (!isSafeLocalRedirect(value)) return null

  let canonical = value
  for (let index = 0; index < 8; index += 1) {
    const decoded = decodeURIComponent(canonical)
    if (decoded === canonical) break
    canonical = decoded
  }

  const pathname = new URL(canonical, 'https://quantum.invalid').pathname
  if (pathname === '/api' || pathname.startsWith('/api/')) return null

  return value
}

export function getServiceRecoveryReturnTo(url: Pick<URL, 'pathname' | 'searchParams'>): string | null {
  const searchParams = new URLSearchParams(url.searchParams)
  searchParams.delete('_rsc')
  const search = searchParams.size > 0 ? `?${searchParams.toString()}` : ''

  return getSafeServiceRecoveryDestination(`${url.pathname}${search}`)
}

export function getPublicLoginErrorMessage(value: string | null | undefined): string | null {
  if (!value) return null
  if (PUBLIC_LOGIN_ERRORS.has(value)) return value
  return '로그인을 완료하지 못했어요. 다시 시도해 주세요.'
}
