import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import {
  isRecentAccountAuthentication,
  parseAccountDeletionRequest,
  resolveVoiceCleanupStatus,
} from '@/lib/account/deletion-contract'
import { accountApiFailure, accountPrivateJson } from '@/lib/account/http'
import { drainVoiceMediaOutbox } from '@/lib/voice/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const client = createSupabaseRequestClient(request)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return accountPrivateJson({ error: 'unauthenticated' }, 401)
    const admin = createSupabaseAdminClient()
    if (!admin) return accountPrivateJson({ error: 'service_unavailable' }, 503)
    const { data, error } = await admin.rpc('get_account_deletion_status_for_service', {
      p_actor_user_id: user.id,
    })
    if (error) return accountPrivateJson({ error: 'service_unavailable' }, 503)
    return accountPrivateJson({ request: data ?? null })
  } catch (error) {
    return accountApiFailure(error)
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    const client = createSupabaseRequestClient(request)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return accountPrivateJson({ error: 'unauthenticated' }, 401)
    if (!isRecentAccountAuthentication(user.last_sign_in_at)) {
      return accountPrivateJson({ error: 'reauthentication_required' }, 403)
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > 4096) return accountPrivateJson({ error: 'invalid_input' }, 400)
    const raw = await request.text()
    if (raw.length > 4096) return accountPrivateJson({ error: 'invalid_input' }, 400)
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return accountPrivateJson({ error: 'invalid_json' }, 400)
    }
    const input = parseAccountDeletionRequest(body)
    if (!input) return accountPrivateJson({ error: 'confirmation_required' }, 400)

    const admin = createSupabaseAdminClient()
    if (!admin) return accountPrivateJson({ error: 'service_unavailable' }, 503)
    const { data, error } = await admin.rpc('request_account_deletion_for_service', {
      p_actor_user_id: user.id,
      p_idempotency_key: input.idempotencyKey,
    })
    if (error || !isDeletionResponse(data)) {
      return accountPrivateJson({ error: 'account_deletion_request_failed' }, 503)
    }

    // The database has already revoked application access and queued provider
    // removals. Draining is best-effort; the outbox remains retryable on failure.
    const voiceCleanup = await drainVoiceMediaOutbox()
      .then(resolveVoiceCleanupStatus)
      .catch(() => 'retry_pending' as const)

    // Revoke refresh sessions after the durable denial record exists. Existing
    // short-lived tokens are denied by the app guard and protected DB surfaces.
    const { error: signOutError } = await client.auth.signOut({ scope: 'global' })
    return accountPrivateJson({
      requestId: data.request_id,
      status: data.status,
      requestedAt: data.requested_at,
      accessRevoked: true,
      voiceCleanup,
      providerSessionRevocation: signOutError ? 'retry_pending' : 'requested',
    }, 202)
  } catch (error) {
    return accountApiFailure(error)
  }
}

function isDeletionResponse(value: unknown): value is {
  request_id: string
  status: 'requested' | 'cleanup_pending' | 'retry_wait' | 'auth_delete_pending' | 'completed'
  requested_at: string
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.request_id === 'string'
    && typeof row.requested_at === 'string'
    && ['requested', 'cleanup_pending', 'retry_wait', 'auth_delete_pending', 'completed'].includes(String(row.status))
}
