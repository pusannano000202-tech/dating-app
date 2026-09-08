import { voiceRpc, voiceJson, voiceFailure } from '@/lib/voice/server'
export async function POST(request: Request) {
  try {
    return voiceJson(await voiceRpc(request, 'acknowledge_rules'))
  } catch (e) {
    return voiceFailure(e)
  }
}
