import { NextRequest, NextResponse } from 'next/server'

import { mapCommunityApiError } from '@/lib/community/api-errors'
import { isCommunityCategory, parseCommunityListLimit, validateCommunityPostInput } from '@/lib/community/contracts'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ posts: [], availability: 'auth_required' })
  }

  const feed = req.nextUrl.searchParams.get('feed')
  const category = req.nextUrl.searchParams.get('category')
  const limit = parseCommunityListLimit(req.nextUrl.searchParams.get('limit'))
  if (feed !== 'hot' && !isCommunityCategory(category)) return jsonError('invalid_category', 400)

  const { data, error } = feed === 'hot'
    ? await supabase.rpc('list_hot_community_posts', { p_limit: limit })
    : await supabase.rpc('list_community_posts', {
        p_category: category,
        p_limit: limit,
      })

  if (error) {
    const mapped = mapCommunityApiError(error)
    if (mapped.error === 'community_schema_unavailable') {
      return NextResponse.json({ posts: [], availability: 'schema_unavailable' })
    }
    return jsonError(mapped.error, mapped.status)
  }

  return NextResponse.json(
    { posts: data ?? [], availability: 'ready' },
    { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } },
  )
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)

  const body = await readJson(req)
  const parsed = validateCommunityPostInput(body)
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const { data, error } = parsed.value.category === 'meetup-review'
    ? await supabase.rpc('create_meetup_review', {
        p_meetup_id: parsed.value.meetupId,
        p_title: parsed.value.title,
        p_body: parsed.value.body,
      })
    : await supabase.rpc('create_community_post', {
        p_category: parsed.value.category,
        p_title: parsed.value.title,
        p_body: parsed.value.body,
      })

  if (error) {
    const mapped = mapCommunityApiError(error)
    return jsonError(mapped.error, mapped.status)
  }

  return NextResponse.json({ post: data }, { status: 201 })
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
