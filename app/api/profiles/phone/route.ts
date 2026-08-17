import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

interface RequestBody {
  phone?: unknown
}

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await readJson(request) as RequestBody
  const phone = typeof body.phone === 'string'
    ? normalizeProfilePhone(body.phone)
    : ''

  if (!phone) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
  }

  const verifiedPhone = normalizeProfilePhone(user.phone ?? '')
  if (!verifiedPhone || verifiedPhone !== phone) {
    return NextResponse.json({ error: 'phone_verification_required' }, { status: 409 })
  }

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'server_unavailable' }, { status: 503 })
  }

  const { data, error } = await admin
    .from('users')
    .update({ phone: verifiedPhone })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'phone_save_failed' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'user_record_missing' }, { status: 409 })
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

function normalizeProfilePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  const domesticDigits = digits.startsWith('82') ? `0${digits.slice(2)}` : digits
  if (!/^010\d{8}$/.test(domesticDigits)) return ''
  return `${domesticDigits.slice(0, 3)}-${domesticDigits.slice(3, 7)}-${domesticDigits.slice(7)}`
}
