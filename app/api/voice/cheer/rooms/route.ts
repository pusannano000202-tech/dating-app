import { parseCheerJoinInput } from '@/lib/voice/cheer-service'
import {
  requireVoiceProvider,
  voiceBody,
  voiceFailure,
  voiceJson,
  voiceSceneRpc,
} from '@/lib/voice/server'

export async function POST(request: Request) {
  try {
    const input = parseCheerJoinInput(await voiceBody(request))
    requireVoiceProvider()
    return voiceJson(
      await voiceSceneRpc(request, 'cheer_join', {
        teamId: input.team.id,
        idempotencyKey: input.idempotencyKey,
      }),
    )
  } catch (error) {
    return voiceFailure(error)
  }
}
