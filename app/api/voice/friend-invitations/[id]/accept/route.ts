import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
  requireVoiceProvider,
} from '@/lib/voice/server'
import { requireUuid } from '@/lib/voice/policy'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireVoiceProvider()
    const b = await voiceBody(request)
    return voiceJson(
      await voiceRpc(request, 'accept_friend', {
        invitationId: requireUuid((await params).id),
        idempotencyKey: requireUuid(b.idempotencyKey),
      }),
    )
  } catch (e) {
    return voiceFailure(e)
  }
}
