import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from './lib/dev-auth'
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from './lib/utils'

const PROTECTED_PREFIXES = ['/profile', '/group', '/match', '/friends', '/notifications', '/admin']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const shouldIssueDevAuth =
    isDevAuthBypassEnabled() &&
    pathname.startsWith('/dev/preview')
  const isDevAuthed =
    isDevAuthBypassEnabled() &&
    request.cookies.get(DEV_AUTH_COOKIE)?.value === getDevAuthCookieValue()

  // Supabase 키 없으면 인증 체크 스킵 (로컬 UI 확인용)
  if (!isSupabaseConfigured() || isDevAuthed || shouldIssueDevAuth) {
    const response = NextResponse.next({ request })
    if (shouldIssueDevAuth) {
      response.cookies.set(DEV_AUTH_COOKIE, getDevAuthCookieValue(), {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      })
    }
    return response
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
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

  // 세션 갱신 (이걸 빠뜨리면 새로고침 시 로그아웃됨)
  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 이미 로그인된 상태에서 /login 접근 시 홈으로
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|appearance-types|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
