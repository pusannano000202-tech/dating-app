import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
} from '@/lib/voice/server'
import { parseRoomInput, requireUuid } from '@/lib/voice/policy'
export async function GET(request: Request) {
  try {
    return voiceJson(await voiceRpc(request, 'operator_rooms', {}, true))
  } catch (e) {
    return voiceFailure(e)
  }
}
export async function POST(request: Request) {
  try {
    const b = await voiceBody(request)
    return voiceJson(
      await voiceRpc(
        request,
        'create_room',
        {
          ...parseRoomInput(b.room),
          idempotencyKey: requireUuid(b.idempotencyKey),
        },
        true,
      ),
    )
  } catch (e) {
    return voiceFailure(e)
  }
}
