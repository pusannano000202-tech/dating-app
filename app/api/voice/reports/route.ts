import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
  drainVoiceMediaOutbox,
} from '@/lib/voice/server'
import { requireUuid } from '@/lib/voice/policy'
export const maxDuration = 60
export async function POST(request: Request) {
  try {
    const b = await voiceBody(request)
    if (
      typeof b.reason !== 'string' ||
      b.reason.trim().length < 3 ||
      b.reason.length > 1000 ||
      typeof b.block !== 'boolean'
    )
      throw new Error('invalid_input')
    const sessionId = requireUuid(b.sessionId)
    const result = await voiceRpc(request, 'report', {
      sessionId,
      targetIdentity: requireUuid(b.targetIdentity),
      reason: b.reason,
      block: b.block,
      idempotencyKey: requireUuid(b.idempotencyKey),
    })
    const cleanup = b.block
      ? await drainVoiceMediaOutbox({ sessionId }).catch(() => ({
          pending: true,
        }))
      : null
    return voiceJson({
      ...result,
      mediaCleanupPending: cleanup?.pending ?? false,
    })
  } catch (e) {
    return voiceFailure(e)
  }
}
