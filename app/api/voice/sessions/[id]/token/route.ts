import { issueVoiceToken, voiceJson, voiceFailure } from '@/lib/voice/server'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return voiceJson(await issueVoiceToken(request, (await params).id))
  } catch (e) {
    return voiceFailure(e)
  }
}
