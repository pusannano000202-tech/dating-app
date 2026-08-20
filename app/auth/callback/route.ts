import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isSafeLocalRedirect } from '@/lib/auth/redirect'
import { getOAuthCallbackErrorMessage } from '@/lib/auth/oauth-login'
import { getSupabaseConfigIssue, getSupabasePublicKey, getSupabaseUrl } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const providerError = requestUrl.searchParams.get('error')
  const next = requestUrl.searchParams.get('next')
  const destination = isSafeLocalRedirect(next) ? next : '/'
  const configIssue = getSupabaseConfigIssue()

  if (providerError) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('auth_error', getOAuthCallbackErrorMessage(providerError))
    return NextResponse.redirect(loginUrl)
  }

  if (configIssue) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('auth_error', getOAuthCallbackErrorMessage())
    return NextResponse.redirect(loginUrl)
  }

  if (!code) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('auth_error', getOAuthCallbackErrorMessage())
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.redirect(new URL(destination, requestUrl.origin))

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options ?? {})
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('auth_error', getOAuthCallbackErrorMessage())
    return NextResponse.redirect(loginUrl)
  }

  return response
}
