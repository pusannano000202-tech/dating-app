import type { AccessRole } from './access-context'

const AUTH_LOOP_SEGMENTS = ['/auth', '/login', '/logout'] as const
const ROLE_DEFAULT_DESTINATIONS: Record<AccessRole, string> = {
  user: '/',
  partner: '/partner/tonight',
  admin: '/admin/tonight',
  super_admin: '/admin/super-admin/tonight',
}

function isPathInSegment(pathname: string, segment: string): boolean {
  return pathname === segment || pathname.startsWith(`${segment}/`)
}

function hasUnsafeRedirectSyntax(value: string): boolean {
  return (
    value.length === 0
    || value.length > 2048
    || /[\u0000-\u001f\u007f\\]/.test(value)
    || !value.startsWith('/')
    || value.startsWith('//')
  )
}

function decodeRedirectLayers(value: string): string[] | null {
  const layers = [value]
  let current = value

  for (let index = 0; index < 8; index += 1) {
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return null
    }
    if (decoded === current) return layers
    layers.push(decoded)
    current = decoded
  }

  // Excessive encoding is not a valid navigation need and is commonly used
  // to hide a protocol-relative or privileged path from a shallow validator.
  return null
}

export function isSafeLocalRedirect(path: string | null | undefined): path is string {
  if (typeof path !== 'string' || path !== path.trim()) return false

  const layers = decodeRedirectLayers(path)
  if (!layers || layers.some(hasUnsafeRedirectSyntax)) return false

  for (const layer of layers) {
    try {
      const parsed = new URL(layer, 'https://quantum.invalid')
      if (parsed.origin !== 'https://quantum.invalid') return false
      if (AUTH_LOOP_SEGMENTS.some((segment) => isPathInSegment(parsed.pathname, segment))) {
        return false
      }
    } catch {
      return false
    }
  }

  return true
}

export function getRequestedRoute(pathname: string, search: string): string {
  return `${pathname}${search.startsWith('?') ? search : ''}`
}

export function getAuthContinueDestination(requestedRedirect?: string | null): string {
  if (!isSafeLocalRedirect(requestedRedirect)) return '/auth/continue'
  return `/auth/continue?next=${encodeURIComponent(requestedRedirect)}`
}

export function getPostLoginDestination({
  requestedRedirect,
}: {
  requestedRedirect?: string | null
}): string {
  return getAuthContinueDestination(requestedRedirect)
}

export function getDefaultDestinationForRole(role: AccessRole): string {
  return ROLE_DEFAULT_DESTINATIONS[role]
}

export function isRedirectAllowedForRole(role: AccessRole, requestedRedirect: string): boolean {
  if (!isSafeLocalRedirect(requestedRedirect)) return false

  const layers = decodeRedirectLayers(requestedRedirect)
  if (!layers) return false
  const canonicalLayer = layers[layers.length - 1]
  if (!canonicalLayer) return false
  const pathname = new URL(canonicalLayer, 'https://quantum.invalid').pathname
  if (role === 'super_admin') return isPathInSegment(pathname, '/admin')
  if (role === 'admin') {
    return isPathInSegment(pathname, '/admin')
      && !isPathInSegment(pathname, '/admin/super-admin')
  }
  if (role === 'partner') return isPathInSegment(pathname, '/partner')

  return !isPathInSegment(pathname, '/admin')
    && !isPathInSegment(pathname, '/partner')
    && !isPathInSegment(pathname, '/dev')
}

export function getRoleDestination(
  role: AccessRole,
  requestedRedirect?: string | null,
): string {
  if (requestedRedirect && isRedirectAllowedForRole(role, requestedRedirect)) {
    return requestedRedirect
  }
  return getDefaultDestinationForRole(role)
}
