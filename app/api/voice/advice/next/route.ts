import { parseAdviceNextInput } from '@/lib/voice/advice'
import {
  drainVoiceMediaOutbox,
  requireVoiceProvider,
  voiceBody,
  voiceFailure,
  voiceJson,
  voiceSceneRpc,
} from '@/lib/voice/server'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const input = parseAdviceNextInput(await voiceBody(request))
    requireVoiceProvider()
    let result = await voiceSceneRpc(request, 'advice_next', input)
    const cleanup = await drainVoiceMediaOutbox({ sessionId: input.sessionId }).catch(
      () => ({ pending: true }),
    )
    if (!cleanup.pending) {
      result = await voiceSceneRpc(request, 'advice_resume', {
        idempotencyKey: crypto.randomUUID(),
      })
    }
    return voiceJson({ ...result, mediaCleanupPending: cleanup.pending })
  } catch (error) {
    return voiceFailure(error)
  }
}
