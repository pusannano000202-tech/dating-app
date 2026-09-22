import { NextRequest, NextResponse } from 'next/server'

import { isMeetupCategory, parseCommunityListLimit } from '@/lib/community/contracts'
import { parseMeetupScope } from '@/lib/community/department-rooms'
import { isMeetupGenderMode } from '@/lib/community/meetup-gender'
import { isMeetupListActivity, validateMeetupCreateV3Input } from '@/lib/meetups/contracts'
import { isMeetupListCursor, presentMeetupPage } from '@/lib/meetups/list-page'
import { meetupRpcErrorResponse } from '@/lib/meetups/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'
import { isSupabaseConfigured } from '@/lib/utils'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return jsonError('community_schema_unavailable', 503)
  try { return await listMeetups(req) } catch { return jsonError('community_unavailable', 503) }
}

async function listMeetups(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ meetups: [], availability: 'auth_required' }, { headers })
  }

  const categoryParam = req.nextUrl.searchParams.get('category')
  const activityKeyParam = req.nextUrl.searchParams.get('activity_key')
  const genderModeParam = req.nextUrl.searchParams.get('gender_mode')
  const scopeParam = req.nextUrl.searchParams.get('scope_type')
  const limit = parseCommunityListLimit(req.nextUrl.searchParams.get('limit'))
  const cursor = req.nextUrl.searchParams.get('cursor')
  if (cursor !== null && !isMeetupListCursor(cursor)) return jsonError('invalid_cursor', 400)
  if (categoryParam && !isMeetupCategory(categoryParam)) {
    return jsonError('invalid_category', 400)
  }
  if (activityKeyParam !== null && !isMeetupListActivity(activityKeyParam, categoryParam || null)) {
    return jsonError('invalid_activity_key', 400)
  }
  if (genderModeParam !== null && !isMeetupGenderMode(genderModeParam)) {
    return jsonError('invalid_gender_mode', 400)
  }
  if (scopeParam !== null && !parseMeetupScope(scopeParam)) {
    return jsonError('invalid_scope_type', 400)
  }

  const listArgs = {
    p_category: categoryParam || null,
    p_limit: limit + 1,
    p_gender_mode: genderModeParam,
    p_scope_type: scopeParam,
    p_cursor: cursor,
  }
  // Filtering happens inside the RPC before keyset pagination. Never fall back
  // to a broader, already-limited v4 page when a requested activity is unavailable.
  const { data, error } = activityKeyParam === null
    ? await supabase.rpc('list_activity_meetups_v4', listArgs)
    : await supabase.rpc('list_activity_meetups_v5', { ...listArgs, p_activity_key: activityKeyParam })

  if (error) {
    return meetupRpcErrorResponse(error)
  }

  const page = presentMeetupPage(data, limit)
  if (!page) return jsonError('community_unavailable', 503)
  return NextResponse.json(page, { headers })
}

export async function POST(req: NextRequest) {
  try { assertTrustedMutationOrigin(req) }
  catch (error) { return jsonError('request_not_allowed', error instanceof TrustedOriginError ? error.status : 403) }
  if (!isSupabaseConfigured()) return jsonError('community_schema_unavailable', 503)
  try { return await createMeetup(req) } catch { return jsonError('community_unavailable', 503) }
}

async function createMeetup(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)

  const body = await readJson(req)
  const parsed = validateMeetupCreateV3Input(body)
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const { data, error } = await supabase.rpc('create_activity_meetup_v4', {
    p_category: parsed.value.category,
    p_title: parsed.value.title,
    p_description: parsed.value.description,
    p_place_name: parsed.value.placeName,
    p_scheduled_at: parsed.value.scheduledAt,
    p_capacity: parsed.value.capacity,
    p_gender_mode: parsed.value.genderMode,
    p_ends_at: parsed.value.endsAt,
    p_scope_type: parsed.value.scopeType,
    p_activity_key: parsed.value.activityKey,
    p_idempotency_key: parsed.value.idempotencyKey,
    p_schedule_status: parsed.value.scheduleStatus,
  })

  if (error) {
    return meetupRpcErrorResponse(error)
  }

  return NextResponse.json({ meetup: data }, { status: 201, headers })
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers })
}
