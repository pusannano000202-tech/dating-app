import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
  drainVoiceMediaOutbox,
} from '@/lib/voice/server'
import { parseVoiceCommand, requireUuid } from '@/lib/voice/policy'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context) {
  try {
    return voiceJson(
      await voiceRpc(request, 'session', {
        sessionId: requireUuid((await params).id),
      }),
    )
  } catch (e) {
    return voiceFailure(e)
  }
}
export const maxDuration = 60
export async function POST(request: Request, { params }: Context) {
  try {
    const command = parseVoiceCommand(await voiceBody(request))
    const sessionId = requireUuid((await params).id)
    const result = await voiceRpc(request, 'session_command', {
      sessionId,
      ...command,
    })
    let mediaCleanupPending = false
    if (['leave', 'next', 'kick', 'close', 'mode'].includes(command.action)) {
      const cleanup = await drainVoiceMediaOutbox({ sessionId }).catch(() => ({
        pending: true,
      }))
      mediaCleanupPending = cleanup.pending
    }
    return voiceJson({ ...result, mediaCleanupPending })
  } catch (e) {
    return voiceFailure(e)
  }
}
