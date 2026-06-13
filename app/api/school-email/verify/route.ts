import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isPnuEmail, normalizeSchoolEmail } from '@/lib/auth/school-email'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabasePublicKey } from '@/lib/utils'

interface VerifyBody {
  email?: unknown
  code?: unknown
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await readJson(request) as VerifyBody
  const email = typeof body.email === 'string' ? normalizeSchoolEmail(body.email) : ''
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '').slice(0, 6) : ''

  if (!isPnuEmail(email)) {
    return NextResponse.json({ error: 'invalid_school_email' }, { status: 400 })
  }

  if (code.length !== 6) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('verify_school_email_code', {
    p_email: email,
    p_code_hash: hashSchoolEmailCode(user.id, email, code),
  })

  if (error) {
    return NextResponse.json({ error: 'verify_failed' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'code_mismatch' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function hashSchoolEmailCode(userId: string, email: string, code: string): string {
  const secret = process.env.SCHOOL_EMAIL_CODE_SECRET || getSupabasePublicKey() || 'local'
  return createHash('sha256')
    .update(`${secret}:${userId}:${email}:${code}`)
    .digest('hex')
}
