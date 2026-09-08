import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return response({ error: 'unauthorized' }, 401)
  return response({ phone_verified: Boolean(user.phone && user.phone_confirmed_at) }, 200)
}

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return response({ error: 'unauthorized' }, 401)

  // Direct profile-table phone writes are retired. Supabase Auth must verify the
  // number first through the challenge-bound OTP endpoints.
  return response({
    error: 'phone_otp_required',
    legacy_error: 'phone_verification_required',
    start: '/api/auth/phone/start',
    verify: '/api/auth/phone/verify',
  }, 409)
}

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  })
}
