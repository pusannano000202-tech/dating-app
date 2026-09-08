import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
  requireVoiceProvider,
  drainVoiceMediaOutbox,
} from '@/lib/voice/server'
import { parseVoiceCommand, requireUuid } from '@/lib/voice/policy'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context) {
  try {
    return voiceJson(
      await voiceRpc(request, 'room', {
        roomId: requireUuid((await params).id),
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
    if (command.action === 'join') requireVoiceProvider()
    const roomId = requireUuid((await params).id)
    const result = await voiceRpc(request, 'room_command', {
      roomId,
      ...command,
    })
    let mediaCleanupPending = false
    if (
      ['leave', 'kick', 'close', 'cancel', 'delay', 'reschedule'].includes(
        command.action,
      )
    ) {
      const cleanup = await drainVoiceMediaOutbox({ roomId }).catch(() => ({
        pending: true,
      }))
      mediaCleanupPending = cleanup.pending
    }
    return voiceJson({ ...result, mediaCleanupPending })
  } catch (e) {
    return voiceFailure(e)
  }
}
