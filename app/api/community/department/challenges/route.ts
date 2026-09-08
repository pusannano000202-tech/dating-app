import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { meetupInputErrorResponse, meetupJson, meetupRpcErrorResponse } from '@/lib/meetups/http'
import { asInteger, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { isSupabaseConfigured } from '@/lib/utils'

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
  const { data, error } = await supabase.rpc('list_my_department_challenges')
  if (error) return meetupRpcErrorResponse(error)
  return meetupJson({ challenges: Array.isArray(data) ? data : [] })
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    if (!isSupabaseConfigured()) return meetupJson({ error: 'community_schema_unavailable' }, 503)
    const body = await readStrictJson(request, ['category', 'title', 'rules', 'team_capacity', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return meetupJson({ error: 'Unauthorized' }, 401)
    const { data, error } = await supabase.rpc('create_department_challenge', {
      p_category: asRequiredString(body.category, 'category', { maxLength: 20, pattern: /^(soccer|gaming)$/ }),
      p_title: asRequiredString(body.title, 'title', { minLength: 4, maxLength: 80 }),
      p_rules: asRequiredString(body.rules, 'rules', { minLength: 0, maxLength: 2000 }),
      p_team_capacity: asInteger(body.team_capacity, 'team_capacity', { min: 2, max: 20 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return meetupRpcErrorResponse(error)
    return meetupJson({ challenge: data }, 201)
  } catch (error) {
    return meetupInputErrorResponse(error)
  }
}

