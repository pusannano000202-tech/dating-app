import { voiceRpc, voiceJson, voiceFailure } from '@/lib/voice/server'
import { voiceProviderConfig } from '@/lib/voice/policy'
export async function GET(request: Request) {
  try {
    return voiceJson({
      ...(await voiceRpc(request, 'list_rooms')),
      providerReady: Boolean(voiceProviderConfig(process.env)),
    })
  } catch (e) {
    return voiceFailure(e)
  }
}
