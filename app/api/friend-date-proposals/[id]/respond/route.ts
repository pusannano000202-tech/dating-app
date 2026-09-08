import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('Unauthorized', 401)
  if (!isUuid(params.id)) return jsonError('invalid_proposal_id', 400)

  const body = await readJson(request)
  if (!isRecord(body) || typeof body.accept !== 'boolean') return jsonError('invalid_request', 400)

  const { data, error } = await supabase.rpc('respond_friend_date_proposal', {
    p_proposal_id: params.id,
    p_accept: body.accept,
  })
  if (error) {
    const code = error.message?.includes('proposal_not_pending_or_forbidden')
      ? 'proposal_not_pending_or_forbidden'
      : 'friend_date_response_failed'
    return jsonError(code, code === 'proposal_not_pending_or_forbidden' ? 409 : 400)
  }

  return NextResponse.json({ status: data })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
