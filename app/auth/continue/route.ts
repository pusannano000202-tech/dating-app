import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

import { getRoleDestination, isSafeLocalRedirect } from '@/lib/auth/redirect'
import { RequestGuardError, requireServerAccess, type AccessGuardClient } from '@/lib/auth/server-guards'
import { getPublicAppOrigin, getSupabaseConfigIssue, getSupabasePublicKey, getSupabaseUrl } from '@/lib/utils'

type CookieMutation = { name: string; value: string; options?: CookieOptions }

const PRIVATE_NO_STORE = 'private, no-store'

function applyPrivateHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', PRIVATE_NO_STORE)
  response.headers.set('Vary', 'Cookie')
  return response
}

function applyCookieMutations(response: NextResponse, cookiesToSet: CookieMutation[]): NextResponse {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options ?? {})
  })
  return applyPrivateHeaders(response)
}

function unavailable(cookiesToSet: CookieMutation[] = []): NextResponse {
  return applyCookieMutations(NextResponse.json(
    { error: '로그인 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
    { status: 503 },
  ), cookiesToSet)
}

export async function GET(request: NextRequest) {
  if (getSupabaseConfigIssue()) return unavailable()

  const requestUrl = new URL(request.url)
  const appOrigin = getPublicAppOrigin()
  if (!appOrigin) return unavailable()
  const requestedRedirect = requestUrl.searchParams.get('next')
  const cookiesToSet: CookieMutation[] = []

  try {
    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabasePublicKey(),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(nextCookies: CookieMutation[]) {
            cookiesToSet.splice(0, cookiesToSet.length, ...nextCookies)
          },
        },
      },
    )
    const { access } = await requireServerAccess(supabase as unknown as AccessGuardClient)
    const destination = getRoleDestination(access.accessRole, requestedRedirect)
    return applyCookieMutations(
      NextResponse.redirect(new URL(destination, appOrigin)),
      cookiesToSet,
    )
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) {
      const loginUrl = new URL('/login', appOrigin)
      if (isSafeLocalRedirect(requestedRedirect)) {
        loginUrl.searchParams.set('redirect', requestedRedirect)
      }
      return applyCookieMutations(NextResponse.redirect(loginUrl), cookiesToSet)
    }
    return unavailable(cookiesToSet)
  }
}
