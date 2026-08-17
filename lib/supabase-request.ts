import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

import { getBearerAccessToken } from './auth/api-request-auth'
import { getSupabasePublicKey, getSupabaseUrl } from './utils'

export function createSupabaseRequestClient(request: Request) {
  const authorization = request.headers.get('authorization')
  if (authorization === null) {
    const requestCookies = parseCookieHeader(request.headers.get('cookie') ?? '')

    return createServerClient(getSupabaseUrl(), getSupabasePublicKey(), {
      cookies: {
        getAll() {
          return requestCookies
        },
        setAll() {},
      },
    })
  }

  const accessToken = getBearerAccessToken(authorization)
  return createClient(getSupabaseUrl(), getSupabasePublicKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  })
}
