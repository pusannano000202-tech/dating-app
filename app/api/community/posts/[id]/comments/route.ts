import { NextRequest, NextResponse } from 'next/server'

import { mapCommunityApiError } from '@/lib/community/api-errors'
import { validateCommunityCommentInput } from '@/lib/community/contracts'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)
  if (!isUuid(params.id)) return jsonError('invalid_post_id', 400)

  const { data, error } = await supabase.rpc('list_community_post_comments', {
    p_post_id: params.id,
    p_limit: 100,
  })
  if (error) {
    const mapped = mapCommunityApiError(error)
    return jsonError(mapped.error, mapped.status)
  }

  return NextResponse.json(
    { comments: data ?? [] },
    { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } },
  )
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)
  if (!isUuid(params.id)) return jsonError('invalid_post_id', 400)

  const parsed = validateCommunityCommentInput(await readJson(req))
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const { data, error } = await supabase.rpc('create_community_post_comment', {
    p_post_id: params.id,
    p_body: parsed.value.body,
    p_parent_comment_id: parsed.value.parentCommentId ?? null,
  })
  if (error) {
    const mapped = mapCommunityApiError(error)
    return jsonError(mapped.error, mapped.status)
  }

  return NextResponse.json({ comment: data }, { status: 201 })
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
