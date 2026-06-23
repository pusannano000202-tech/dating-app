import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isSafeLocalRedirect } from '@/lib/auth/school-email'
import { getSupabaseConfigIssue, getSupabasePublicKey, getSupabaseUrl } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')
  const destination = isSafeLocalRedirect(next) ? next : '/profile/basic'
  const configIssue = getSupabaseConfigIssue()

  if (configIssue) {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('auth_error', configIssue)
    return NextResponse.redirect(loginUrl)
  }

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabasePublicKey(),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(destination, requestUrl.origin))
}
