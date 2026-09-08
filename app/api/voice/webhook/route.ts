import { WebhookReceiver } from 'livekit-server-sdk'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  requireVoiceProvider,
  voiceJson,
  drainVoiceMediaOutbox,
} from '@/lib/voice/server'
import { UUID_PATTERN } from '@/lib/voice/policy'
export const maxDuration = 60
export async function POST(request: Request) {
  let event
  try {
    const config = requireVoiceProvider()
    const body = await request.text()
    if (body.length > 65536) return voiceJson({ error: 'invalid_input' }, 400)
    event = await new WebhookReceiver(config.key, config.secret).receive(
      body,
      request.headers.get('authorization') ?? undefined,
    )
  } catch {
    return voiceJson({ error: 'invalid_webhook' }, 401)
  }
  const admin = createSupabaseAdminClient()
  if (!admin) return voiceJson({ error: 'service_unavailable' }, 503)
  if (!event.id) return voiceJson({ error: 'invalid_webhook' }, 400)
  if (
    !event.participant?.identity ||
    !UUID_PATTERN.test(event.participant.identity) ||
    !event.room?.name
  )
    return voiceJson({ ignored: true })
  const { error } = await admin.rpc('apply_voice_provider_event', {
    p_event_id: event.id,
    p_event: event.event,
    p_room: event.room.name,
    p_identity: event.participant.identity,
    p_sid: event.participant.sid,
    p_created_at: Number(event.createdAt),
  })
  if (error) return voiceJson({ error: 'service_unavailable' }, 503)
  const sessionId = event.room.name.startsWith('qv-')
    ? event.room.name.slice(3)
    : ''
  if (UUID_PATTERN.test(sessionId))
    await drainVoiceMediaOutbox({ sessionId }).catch(() => null)
  return voiceJson({ accepted: true })
}
