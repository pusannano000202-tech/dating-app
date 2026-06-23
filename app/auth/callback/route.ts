import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')

  const isSafeRedirect = next && next.startsWith('/') && !next.startsWith('//')
  const destination = isSafeRedirect ? next : '/profile/basic'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL('/login?auth_error=supabase_not_configured', requestUrl.origin))
  }

  const response = NextResponse.redirect(new URL(destination, requestUrl.origin))

  if (code) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
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
    })

    await supabase.auth.exchangeCodeForSession(code)
  }

  return response
}
