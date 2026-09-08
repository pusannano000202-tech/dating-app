import { NextRequest, NextResponse } from 'next/server'
import {
  RequestGuardError,
  requestGuardErrorResponse,
  requireRequestAccess,
} from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { toPublicErrorCode } from '@/lib/api/public-error'

const MUTABLE_CONFIG_KEYS = new Set(['match_requires_approval', 'tonight_applications_open'])
const READABLE_CONFIG_KEYS = new Set(['match_requires_approval', 'tonight_applications_open'])

export async function GET(req: NextRequest) {
  try {
    await requireRequestAccess(req, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return requestGuardErrorResponse(error)
  }

  const key = req.nextUrl.searchParams.get('key')
  if (!key || !READABLE_CONFIG_KEYS.has(key)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_app_config', { p_key: key })
  if (error) return NextResponse.json({ error: toPublicErrorCode(error.message, 'lookup_failed') }, { status: 400 })
  return NextResponse.json({ key, value: data })
}

export async function POST(req: NextRequest) {
  try {
    await requireRequestAccess(req, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
      checkMutationOrigin: true,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return requestGuardErrorResponse(error)
  }

  const body = await readJson(req)
  if (!hasOnlyKeys(body, ['key', 'value'])) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const key = typeof body.key === 'string' ? body.key : null
  if (!key || !MUTABLE_CONFIG_KEYS.has(key) || typeof body.value !== 'boolean') {
    return NextResponse.json({ error: 'invalid_key_or_value' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('set_app_config', { p_key: key, p_value: body.value })
  if (error) return NextResponse.json({ error: toPublicErrorCode(error.message, 'update_failed') }, { status: 400 })
  return NextResponse.json({ key, value: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowlist = new Set(allowed)
  return Object.keys(body).every((key) => allowlist.has(key))
}
