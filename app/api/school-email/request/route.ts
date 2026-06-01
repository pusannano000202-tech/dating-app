import { createHash, randomInt } from 'crypto'
import { createClient as createSupabaseServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isPnuEmail, normalizeSchoolEmail } from '@/lib/auth/school-email'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface RequestBody {
  email?: unknown
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await readJson(request) as RequestBody
  const email = typeof body.email === 'string' ? normalizeSchoolEmail(body.email) : ''

  if (!isPnuEmail(email)) {
    return NextResponse.json({ error: 'invalid_school_email' }, { status: 400 })
  }

  if (process.env.NODE_ENV === 'production' && process.env.SCHOOL_EMAIL_DEV_MODE !== 'true') {
    return NextResponse.json({ error: 'email_delivery_not_configured' }, { status: 501 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 })
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const service = createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  await service
    .from('users')
    .upsert({ id: user.id, email: user.email ?? null }, { onConflict: 'id' })

  const { error } = await service.from('school_email_verification_codes').insert({
    user_id: user.id,
    email,
    code_hash: hashSchoolEmailCode(user.id, email, code),
    expires_at: expiresAt,
  })

  if (error) {
    return NextResponse.json({ error: 'request_failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    expires_at: expiresAt,
    dev_code: code,
  })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function hashSchoolEmailCode(userId: string, email: string, code: string): string {
  const secret = process.env.SCHOOL_EMAIL_CODE_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'local'
  return createHash('sha256')
    .update(`${secret}:${userId}:${email}:${code}`)
    .digest('hex')
}
