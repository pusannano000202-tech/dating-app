import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from './lib/dev-auth'
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from './lib/utils'

const PROTECTED_PREFIXES = ['/profile', '/group', '/match', '/friends', '/notifications', '/admin']
const DEV_AUTH_MAX_AGE = 60 * 60 * 24 * 7

function setDevAuthCookie(response: NextResponse): void {
  response.cookies.set(DEV_AUTH_COOKIE, getDevAuthCookieValue(), {
    path: '/',
    maxAge: DEV_AUTH_MAX_AGE,
    sameSite: 'lax',
  })
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const canBypassAuth = isDevAuthBypassEnabled()
  const shouldIssueDevAuth =
    canBypassAuth &&
    (
      pathname.startsWith('/dev/preview') ||
      pathname === '/' ||
      pathname === '/login' ||
      isProtected
    )

  if (shouldIssueDevAuth) {
    request.cookies.set(DEV_AUTH_COOKIE, getDevAuthCookieValue())
  }

  const isDevAuthed =
    canBypassAuth &&
    request.cookies.get(DEV_AUTH_COOKIE)?.value === getDevAuthCookieValue()

  if (canBypassAuth && pathname === '/login') {
    const response = NextResponse.redirect(new URL('/dev/preview', request.url))
    setDevAuthCookie(response)
    return response
  }

  if (!isSupabaseConfigured() || isDevAuthed || shouldIssueDevAuth) {
    if (pathname === '/' && !isDevAuthed && !shouldIssueDevAuth) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const response = NextResponse.next({ request })
    if (shouldIssueDevAuth) {
      setDevAuthCookie(response)
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

  const { data: { user } } = await supabase.auth.getUser()

  if (pathname === '/' && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|appearance-types|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg)$).*)',
  ],
}
