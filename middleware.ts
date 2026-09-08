import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { AuthError, User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  DEV_AUTH_COOKIE,
  getDevAuthCookieValue,
  isDevAuthBypassEnabled,
  shouldIssueDevAuthCookie,
} from './lib/dev-auth'
import { getRequestedRoute } from './lib/auth/redirect'
import { checkAccountAccess, hasConflictingApiActors, requiresAccountAccessCheck } from './lib/auth/account-access'
import { createSupabaseRequestClient } from './lib/supabase-request'
import {
  AUTH_SERVICE_RECOVERY_PATH,
  getServiceRecoveryReturnTo,
  isBrowserPageNavigation,
} from './lib/auth/service-unavailable'
import { getPublicAppOrigin, getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from './lib/utils'

const PROTECTED_PREFIXES = [
  '/profile',
  '/group',
  '/match',
  '/friends',
  '/notifications',
  '/tonight',
  '/partner',
  '/admin',
] as const
const FRIEND_INVITE_LANDING_PATH = /^\/tonight\/invite\/[0-9a-f]{64}$/i
const DEV_AUTH_MAX_AGE = 60 * 60 * 24 * 7

function isPathInSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function setDevAuthCookie(response: NextResponse): void {
  response.cookies.set(DEV_AUTH_COOKIE, getDevAuthCookieValue(), {
    path: '/',
    maxAge: DEV_AUTH_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })
}

function preserveResponseCookies(target: NextResponse, source: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  target.headers.set('Cache-Control', 'private, no-store')
  target.headers.set('Vary', 'Cookie, Authorization')
  return target
}

function unavailableResponse(
  request: NextRequest,
  appOrigin: string,
  source?: NextResponse,
): NextResponse {
  let target: NextResponse

  if (isBrowserPageNavigation(request.method, request.headers)) {
    const recoveryUrl = new URL(AUTH_SERVICE_RECOVERY_PATH, appOrigin)
    const returnTo = getServiceRecoveryReturnTo(request.nextUrl)
    if (returnTo) recoveryUrl.searchParams.set('returnTo', returnTo)
    target = NextResponse.redirect(recoveryUrl)
  } else {
    target = NextResponse.json(
      { error: '인증 서비스를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503 },
    )
  }

  target.headers.set('Cache-Control', 'private, no-store')
  return source ? preserveResponseCookies(target, source) : target
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isReauthentication = pathname === '/login'
    && request.nextUrl.searchParams.get('reauth') === '1'

  const isDevRoute = isPathInSegment(pathname, '/dev')
  if (process.env.NODE_ENV === 'production' && isDevRoute) {
    return new NextResponse(null, { status: 404 })
  }
  const appOrigin = getPublicAppOrigin()
  if (!appOrigin) {
    return NextResponse.json(
      { error: '서비스 주소 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const isFriendInviteLanding = FRIEND_INVITE_LANDING_PATH.test(pathname)
  const isProtected = !isFriendInviteLanding && PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
  const canBypassAuth = isDevAuthBypassEnabled()
  const shouldIssueDevAuth = shouldIssueDevAuthCookie({ pathname })

  if (pathname === '/dev/preview' && !shouldIssueDevAuth) {
    return NextResponse.redirect(new URL('/login', appOrigin))
  }

  if (shouldIssueDevAuth) {
    request.cookies.set(DEV_AUTH_COOKIE, getDevAuthCookieValue())
  }

  const isDevAuthed =
    isDevRoute && canBypassAuth &&
    request.cookies.get(DEV_AUTH_COOKIE)?.value === getDevAuthCookieValue()

  if (isDevRoute) {
    if (!isDevAuthed && !shouldIssueDevAuth) {
      return NextResponse.redirect(new URL('/login', appOrigin))
    }
    const response = NextResponse.next({ request })
    if (shouldIssueDevAuth) {
      setDevAuthCookie(response)
    }
    return response
  }

  if (pathname === AUTH_SERVICE_RECOVERY_PATH) {
    return NextResponse.next({ request })
  }

  if (!isSupabaseConfigured()) {
    if (isProtected || pathname === '/') {
      return unavailableResponse(request, appOrigin)
    }
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  let user: User | null = null
  let authError: AuthError | null = null

  try {
    const cookieClient = createServerClient(
      getSupabaseUrl(),
      getSupabasePublicKey(),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options ?? {})
            )
          },
        },
      }
    )
    const cookieAuth = await cookieClient.auth.getUser()
    if (cookieAuth.error && ![400, 401, 403].includes(cookieAuth.error.status ?? 0)) {
      return unavailableResponse(request, appOrigin, response)
    }
    const hasApiAuthorization = pathname.startsWith('/api/') && request.headers.has('authorization')
    const supabase = hasApiAuthorization ? createSupabaseRequestClient(request) : cookieClient
    const authResult = hasApiAuthorization ? await supabase.auth.getUser() : cookieAuth
    user = authResult.data.user
    authError = authResult.error
    // Some retained endpoints still use cookie authentication. Reject mixed
    // actors instead of allowing those endpoints to execute as a second user.
    if (hasApiAuthorization && hasConflictingApiActors(cookieAuth.data.user?.id ?? null, user?.id ?? null)) {
      return preserveResponseCookies(NextResponse.json({ error: 'ambiguous_authentication' }, { status: 401 }), response)
    }
    if (user && !authError && requiresAccountAccessCheck(pathname, isReauthentication)) {
      const accountAccess = await checkAccountAccess(supabase)
      if (accountAccess === 'deletion_pending') {
        const target = !pathname.startsWith('/api/') && isBrowserPageNavigation(request.method, request.headers)
          ? NextResponse.redirect(new URL('/account', appOrigin))
          : NextResponse.json(
            { error: '탈퇴 처리 중인 계정입니다. 계정 화면에서 진행 상태를 확인해 주세요.', code: 'account_deletion_pending' },
            { status: 403 },
          )
        return preserveResponseCookies(target, response)
      }
      if (accountAccess === 'unavailable') return unavailableResponse(request, appOrigin, response)
    }
  } catch {
    return unavailableResponse(request, appOrigin, response)
  }

  if (authError && ![400, 401, 403].includes(authError.status ?? 0)) {
    return unavailableResponse(request, appOrigin, response)
  }

  if (pathname === '/' && !user) {
    return preserveResponseCookies(NextResponse.redirect(new URL('/login', appOrigin)), response)
  }

  if (isProtected && !user) {
    const loginUrl = new URL('/login', appOrigin)
    loginUrl.searchParams.set('redirect', getRequestedRoute(pathname, search))
    return preserveResponseCookies(NextResponse.redirect(loginUrl), response)
  }

  if (pathname === '/login' && user && !isReauthentication) {
    return preserveResponseCookies(NextResponse.redirect(new URL('/auth/continue', appOrigin)), response)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|appearance-types|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg)$).*)',
  ],
}
