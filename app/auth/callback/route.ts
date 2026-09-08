import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getPostLoginDestination } from '@/lib/auth/redirect'
import { getOAuthCallbackErrorMessage } from '@/lib/auth/oauth-login'
import { getPublicAppOrigin, getSupabaseConfigIssue, getSupabasePublicKey, getSupabaseUrl } from '@/lib/utils'

type CookieMutation = { name: string; value: string; options?: CookieOptions }

function applyCookieMutations(response: NextResponse, cookiesToSet: CookieMutation[]): NextResponse {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options ?? {})
  })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie')
  return response
}

function unavailable(cookiesToSet: CookieMutation[] = []): NextResponse {
  return applyCookieMutations(NextResponse.json(
    { error: '로그인 서비스를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
    { status: 503 },
  ), cookiesToSet)
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const providerError = requestUrl.searchParams.get('error')
  const next = requestUrl.searchParams.get('next')
  const destination = getPostLoginDestination({ requestedRedirect: next })
  const configIssue = getSupabaseConfigIssue()
  const appOrigin = getPublicAppOrigin()

  if (!appOrigin) return unavailable()

  if (providerError) {
    const loginUrl = new URL('/login', appOrigin)
    loginUrl.searchParams.set('auth_error', getOAuthCallbackErrorMessage(providerError))
    return applyCookieMutations(NextResponse.redirect(loginUrl), [])
  }

  if (configIssue) return unavailable()

  if (!code) {
    const loginUrl = new URL('/login', appOrigin)
    loginUrl.searchParams.set('auth_error', getOAuthCallbackErrorMessage())
    return applyCookieMutations(NextResponse.redirect(loginUrl), [])
  }

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
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const loginUrl = new URL('/login', appOrigin)
      loginUrl.searchParams.set('auth_error', getOAuthCallbackErrorMessage())
      return applyCookieMutations(NextResponse.redirect(loginUrl), cookiesToSet)
    }

    const response = NextResponse.redirect(new URL(destination, appOrigin))
    return applyCookieMutations(response, cookiesToSet)
  } catch {
    return unavailable(cookiesToSet)
  }
}
