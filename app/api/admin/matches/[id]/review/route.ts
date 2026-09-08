import { NextRequest, NextResponse } from 'next/server'
import {
  RequestGuardError,
  requestGuardErrorResponse,
  requireRequestAccess,
} from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { toPublicErrorCode } from '@/lib/api/public-error'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    await requireRequestAccess(req, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return requestGuardErrorResponse(error)
  }

  const params = await props.params
  if (!isUuid(params.id)) return NextResponse.json({ error: 'invalid_match_id' }, { status: 400 })

  const body = await readJson(req)
  if (!hasOnlyKeys(body, ['decision', 'add_excluded'])) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null
  if (!decision) return NextResponse.json({ error: 'invalid_decision' }, { status: 400 })
  if (body.add_excluded !== undefined && typeof body.add_excluded !== 'boolean') {
    return NextResponse.json({ error: 'invalid_add_excluded' }, { status: 400 })
  }
  if (decision === 'approve' && body.add_excluded === true) {
    return NextResponse.json({ error: 'invalid_add_excluded' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .rpc('admin_review_match', {
      p_match_id: params.id,
      p_decision: decision,
      p_reason: null,
      p_add_excluded: body.add_excluded === true,
    })
    .maybeSingle()
  if (error) return NextResponse.json({ error: toPublicErrorCode(error.message, 'review_failed') }, { status: 400 })
  return NextResponse.json({ result: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowlist = new Set(allowed)
  return Object.keys(body).every((key) => allowlist.has(key))
}
