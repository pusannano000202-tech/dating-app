import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requiresSchoolEmailForPath } from './lib/auth/school-email'

const PROTECTED_PREFIXES = ['/profile', '/group', '/match', '/friends', '/notifications']

export async function middleware(request: NextRequest) {
  // Supabase 키 없으면 인증 체크 스킵 (로컬 UI 확인용)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (
    isProtected &&
    user &&
    !pathname.startsWith('/profile/school') &&
    requiresSchoolEmailForPath(pathname)
  ) {
    const { data: appUser, error } = await supabase
      .from('users')
      .select('school_email_verified_at')
      .eq('id', user.id)
      .maybeSingle()

    if (!error && !appUser?.school_email_verified_at) {
      const schoolUrl = new URL('/profile/school', request.url)
      schoolUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(schoolUrl)
    }
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
