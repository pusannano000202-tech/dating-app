import { parseVoiceRuntimeCommand } from '@/lib/voice/global-runtime'
import {
  voiceBody,
  voiceFailure,
  voiceJson,
  voiceRuntimeRpc,
} from '@/lib/voice/server'

export async function GET(request: Request) {
  try {
    return voiceJson(await voiceRuntimeRpc(request, 'status'))
  } catch (error) {
    return voiceFailure(error)
  }
}

export async function POST(request: Request) {
  try {
    const command = parseVoiceRuntimeCommand(await voiceBody(request))
    return voiceJson(await voiceRuntimeRpc(request, command.action, command))
  } catch (error) {
    return voiceFailure(error)
  }
}
