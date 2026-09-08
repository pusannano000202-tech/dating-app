import {
  requireVoiceProvider,
  voiceBody,
  voiceFailure,
  voiceJson,
  voiceSceneRpc,
} from '@/lib/voice/server'
import { parseAdviceQueueInput, parseAdviceTopic } from '@/lib/voice/advice'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const adviceTopic = parseAdviceTopic(url.searchParams.get('adviceTopic') ?? 'general')
    return voiceJson(await voiceSceneRpc(request, 'advice_status', { adviceTopic }))
  } catch (error) {
    return voiceFailure(error)
  }
}

export async function POST(request: Request) {
  try {
    const input = parseAdviceQueueInput(await voiceBody(request))
    if (input.action !== 'leave') requireVoiceProvider()
    return voiceJson(
      await voiceSceneRpc(request, `advice_${input.action}`, input),
    )
  } catch (error) {
    return voiceFailure(error)
  }
}
