import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import { requireRequestAccess, RequestGuardError } from '../auth/server-guards'
import { createSupabaseRequestClient } from '../supabase-request'
import { createSupabaseAdminClient } from '../supabase-admin'
import { voiceProviderConfig, requireUuid } from './policy'
import { isCommunityFeatureEnabled } from '../community-feature'
import { drainVoiceEffects } from './media-drain'

export function voiceJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization',
    },
  })
}
const publicErrors: Record<string, number> = {
  invalid_input: 400,
  invalid_json: 400,
  not_authenticated: 401,
  forbidden: 403,
  minimum_signup_required: 403,
  voice_rules_required: 403,
  voice_restricted: 403,
  not_found: 404,
  stale_revision: 409,
  sports_event_not_found: 409,
  sports_event_mismatch: 409,
  sports_event_not_ready: 409,
  sports_event_stale_review: 409,
  room_full: 409,
  room_closed: 409,
  already_in_voice: 409,
  blocked_pair: 409,
  idempotency_conflict: 409,
  acceptance_required: 409,
  media_cleanup_pending: 409,
  rate_limited: 429,
  provider_unavailable: 503,
  voice_scene_unavailable: 503,
  service_unavailable: 503,
}
export function voiceFailure(error: unknown) {
  if (error instanceof RequestGuardError)
    return voiceJson({ error: error.code }, error.status)
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : ''
  const code = Object.hasOwn(publicErrors, message)
    ? message
    : 'service_unavailable'
  return voiceJson({ error: code }, publicErrors[code])
}
export async function voiceBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') || 0) > 8192)
    throw new Error('invalid_input')
  const raw = await request.text()
  if (raw.length > 8192) throw new Error('invalid_input')
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error('invalid_json')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('invalid_input')
  return body as Record<string, unknown>
}
export async function voiceRpc(
  request: Request,
  operation: string,
  payload: Record<string, unknown> = {},
  operator = false,
) {
  if (!isCommunityFeatureEnabled()) throw new Error('provider_unavailable')
  await requireRequestAccess(request, {
    checkMutationOrigin: request.method !== 'GET',
    ...(operator ? { allowedRoles: ['admin', 'super_admin'] as const } : {}),
  })
  const client = createSupabaseRequestClient(request)
  const { data, error } = await client.rpc('community_voice_command', {
    p_operation: operation,
    p_payload: payload,
  })
  if (error) throw error
  return data as Record<string, unknown>
}
export async function voiceSceneRpc(
  request: Request,
  operation: string,
  payload: Record<string, unknown> = {},
) {
  if (!isCommunityFeatureEnabled()) throw new Error('provider_unavailable')
  await requireRequestAccess(request, {
    checkMutationOrigin: request.method !== 'GET',
  })
  const client = createSupabaseRequestClient(request)
  const { data, error } = await client.rpc('community_voice_scene_command', {
    p_operation: operation,
    p_payload: payload,
  })
  if (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : ''
    if (code === 'PGRST202' || code === '42883')
      throw new Error('voice_scene_unavailable')
    throw error
  }
  return data as Record<string, unknown>
}
export function requireVoiceProvider() {
  const config = voiceProviderConfig(process.env)
  if (!config) throw new Error('provider_unavailable')
  return config
}

/** The database revokes membership before queuing this retryable media operation. */
export async function drainVoiceMediaOutbox(
  scope: { sessionId?: string; roomId?: string } = {},
) {
  const config = requireVoiceProvider(),
    admin = createSupabaseAdminClient()
  if (!admin) throw new Error('service_unavailable')
  const service = new RoomServiceClient(
    config.url.replace(/^ws/, 'http'),
    config.key,
    config.secret,
    { requestTimeout: 5, failover: false },
  )
  type Effect = {
    id: string
    claim_token: string
    action: string
    room_name: string
    identity: string
    revoked_at: string
  }
  return drainVoiceEffects<Effect>({
    claim: async () => {
      const { data, error } = await admin.rpc('claim_voice_media_effects', {
        p_limit: 25,
        p_session_id: scope.sessionId ?? null,
        p_room_id: scope.roomId ?? null,
      })
      if (error) throw new Error('service_unavailable')
      return data ?? []
    },
    execute: async (effect) => {
      try {
        if (effect.action === 'delete_room')
          await service.deleteRoom(effect.room_name)
        else
          await service.removeParticipant(effect.room_name, effect.identity, {
            revokeTokenTs: BigInt(
              Math.ceil(Date.parse(effect.revoked_at) / 1000),
            ),
          })
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : null
        if (code !== 'not_found') throw error
      }
    },
    finish: async (effect, ok) => {
      const result = await admin.rpc('finish_voice_media_effect', {
        p_id: effect.id,
        p_claim_token: effect.claim_token,
        p_success: ok,
      })
      return !result.error && result.data === true
    },
  })
}
export async function issueVoiceToken(request: Request, sessionId: string) {
  const config = requireVoiceProvider()
  const id = requireUuid(sessionId)
  const context = await voiceRpc(request, 'token_context', { sessionId: id })
  if (
    typeof context.identity !== 'string' ||
    typeof context.roomName !== 'string' ||
    !Number.isSafeInteger(context.generation)
  )
    throw new Error('service_unavailable')
  const token = new AccessToken(config.key, config.secret, {
    identity: context.identity,
    ttl: 60,
  })
  token.addGrant({
    room: context.roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: context.mode === 'speak',
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE],
  })
  const encoded = await token.toJwt()
  // Check again after signing; stale generations must never reach the browser.
  const latest = await voiceRpc(request, 'token_context', { sessionId: id })
  if (
    latest.identity !== context.identity ||
    latest.generation !== context.generation ||
    latest.mode !== context.mode
  )
    throw new Error('stale_revision')
  return {
    url: config.url,
    token: encoded,
    identity: context.identity,
    generation: context.generation,
    mode: context.mode,
  }
}
