import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type DepartmentFriendSuggestionRow = {
  user_id: string
  display_name: string | null
}

type RequestBody = {
  limit?: unknown
  enabled?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req) as RequestBody
  const limit = normalizeLimit(body.limit)
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : null

  if (enabled !== null) {
    const visibilityUpdate = await supabase
      .from('profiles')
      .update({ department_friend_discovery_enabled: enabled })
      .eq('user_id', user.id)

    if (visibilityUpdate.error) {
      return NextResponse.json({ error: 'department_visibility_update_failed' }, { status: 400 })
    }
    if (!enabled) {
      return NextResponse.json({ suggestions: [], total_count: 0, discovery_enabled: false })
    }
  }

  const { data, error } = await supabase
    .rpc('get_department_friend_suggestions', { p_limit: limit })

  if (error) {
    return NextResponse.json(
      { error: translateSuggestionError(error.message) },
      { status: translateSuggestionStatus(error.message) },
    )
  }

  const suggestions = ((data ?? []) as DepartmentFriendSuggestionRow[]).map((row) => ({
    user_id: row.user_id,
    display_name: row.display_name,
  }))

  return NextResponse.json({
    suggestions,
    total_count: suggestions.length,
    discovery_enabled: true,
  })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function normalizeLimit(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 24
  return Math.min(Math.max(Math.floor(numeric), 1), 50)
}

function translateSuggestionError(message = ''): string {
  if (message.includes('profile_school_required')) return 'profile_school_required'
  if (message.includes('profile_department_required')) return 'profile_department_required'
  if (message.includes('department_discovery_consent_required')) return 'department_discovery_consent_required'
  if (message.includes('not_authenticated')) return 'Unauthorized'
  if (message.includes('get_department_friend_suggestions')) return 'department_suggestions_unavailable'
  return 'department_suggestions_failed'
}

function translateSuggestionStatus(message = ''): number {
  if (message.includes('profile_school_required') || message.includes('profile_department_required')) {
    return 400
  }
  if (message.includes('department_discovery_consent_required')) return 403
  if (message.includes('not_authenticated')) return 401
  if (message.includes('get_department_friend_suggestions')) return 501
  return 500
}
