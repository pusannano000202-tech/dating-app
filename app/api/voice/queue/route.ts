import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
  requireVoiceProvider,
} from '@/lib/voice/server'
import { requireUuid } from '@/lib/voice/policy'
import { VOICE_TOPICS } from '@/lib/voice/contracts'
import { requireRequestAccess } from '@/lib/auth/server-guards'
export const maxDuration = 60
export async function GET(request: Request) {
  try {
    return voiceJson(await voiceRpc(request, 'queue_status'))
  } catch (e) {
    return voiceFailure(e)
  }
}
export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { checkMutationOrigin: true })
    const b = await voiceBody(request)
    if (!['join', 'leave'].includes(String(b.action)))
      throw new Error('invalid_input')
    if (b.action === 'join') {
      requireVoiceProvider()
      if (!VOICE_TOPICS.some((t) => t.id === b.topic))
        throw new Error('invalid_input')
    }
    return voiceJson(
      await voiceRpc(request, 'queue_command', {
        action: b.action,
        topic: b.topic,
        idempotencyKey: requireUuid(b.idempotencyKey),
        searchId: requireUuid(b.searchId),
      }),
    )
  } catch (e) {
    return voiceFailure(e)
  }
}
