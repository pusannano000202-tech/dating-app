import { requireRequestAccess, RequestGuardError } from '@/lib/auth/server-guards'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { parseSportsEventMutation } from '@/lib/voice/sports-events'
import { voiceBody, voiceJson } from '@/lib/voice/server'

const statusByError: Record<string, number> = {
  invalid_input: 400,
  invalid_json: 400,
  not_authenticated: 401,
  forbidden: 403,
  minimum_signup_required: 403,
  not_found: 404,
  stale_revision: 409,
  idempotency_conflict: 409,
  sports_event_exists: 409,
  rate_limited: 429,
  provider_unavailable: 503,
  service_unavailable: 503,
}

function failure(error: unknown) {
  if (error instanceof RequestGuardError)
    return voiceJson({ error: error.code }, error.status)
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : ''
  const code = Object.hasOwn(statusByError, message)
    ? message
    : 'service_unavailable'
  return voiceJson({ error: code }, statusByError[code])
}

async function command(
  request: Request,
  operation: 'list' | 'create' | 'update',
  payload: Record<string, unknown> = {},
) {
  if (!isCommunityFeatureEnabled()) throw new Error('provider_unavailable')
  await requireRequestAccess(request, {
    checkMutationOrigin: request.method !== 'GET',
    allowedRoles: ['admin', 'super_admin'],
  })
  const client = createSupabaseRequestClient(request)
  const { data, error } = await client.rpc('community_sports_event_command', {
    p_operation: operation,
    p_payload: payload,
  })
  if (error) throw error
  return data
}

export async function GET(request: Request) {
  try {
    return voiceJson(await command(request, 'list'))
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const mutation = parseSportsEventMutation(await voiceBody(request))
    const { action, ...payload } = mutation
    return voiceJson(await command(request, action, payload))
  } catch (error) {
    return failure(error)
  }
}
