import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
  requireVoiceProvider,
} from '@/lib/voice/server'
import { requireUuid } from '@/lib/voice/policy'
export async function GET(request: Request) {
  try {
    return voiceJson(await voiceRpc(request, 'friend_invitations'))
  } catch (e) {
    return voiceFailure(e)
  }
}
export async function POST(request: Request) {
  try {
    requireVoiceProvider()
    const b = await voiceBody(request)
    return voiceJson(
      await voiceRpc(request, 'invite_friend', {
        friendUserId: requireUuid(b.friendUserId),
        idempotencyKey: requireUuid(b.idempotencyKey),
      }),
    )
  } catch (e) {
    return voiceFailure(e)
  }
}
