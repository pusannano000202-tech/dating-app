import { NextRequest, NextResponse } from 'next/server'

import { isMeetupCategory, parseCommunityListLimit, validateMeetupCreateInput } from '@/lib/community/contracts'
import { mapCommunityApiError } from '@/lib/community/api-errors'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ meetups: [], availability: 'auth_required' })
  }

  const categoryParam = req.nextUrl.searchParams.get('category')
  const limit = parseCommunityListLimit(req.nextUrl.searchParams.get('limit'))
  if (categoryParam && !isMeetupCategory(categoryParam)) {
    return jsonError('invalid_category', 400)
  }

  const { data, error } = await supabase.rpc('list_activity_meetups', {
    p_category: categoryParam || null,
    p_limit: limit,
  })

  if (error) {
    const mapped = mapCommunityApiError(error)
    if (mapped.error === 'community_schema_unavailable') {
      return NextResponse.json({ meetups: [], availability: 'schema_unavailable' })
    }
    return jsonError(mapped.error, mapped.status)
  }

  return NextResponse.json({ meetups: data ?? [], availability: 'ready' })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)

  const body = await readJson(req)
  const parsed = validateMeetupCreateInput(body)
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const { data, error } = await supabase.rpc('create_activity_meetup', {
    p_category: parsed.value.category,
    p_title: parsed.value.title,
    p_description: parsed.value.description,
    p_place_name: parsed.value.placeName,
    p_scheduled_at: parsed.value.scheduledAt,
    p_capacity: parsed.value.capacity,
  })

  if (error) {
    const mapped = mapCommunityApiError(error)
    return jsonError(mapped.error, mapped.status)
  }

  return NextResponse.json({ meetup: data }, { status: 201 })
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
