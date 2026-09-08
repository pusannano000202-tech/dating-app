import {
  voiceRpc,
  voiceJson,
  voiceFailure,
  voiceBody,
} from '@/lib/voice/server'
import { requireUuid } from '@/lib/voice/policy'
export async function GET(request: Request) {
  try {
    return voiceJson(await voiceRpc(request, 'review_reports', {}, true))
  } catch (e) {
    return voiceFailure(e)
  }
}
export async function POST(request: Request) {
  try {
    const b = await voiceBody(request)
    if (
      !['reviewing', 'resolved', 'dismissed'].includes(String(b.status)) ||
      typeof b.resolution !== 'string' ||
      b.resolution.trim().length < 3 ||
      b.resolution.length > 1000
    )
      throw new Error('invalid_input')
    return voiceJson(
      await voiceRpc(
        request,
        'resolve_report',
        {
          reportId: requireUuid(b.reportId),
          status: b.status,
          resolution: b.resolution,
          idempotencyKey: requireUuid(b.idempotencyKey),
        },
        true,
      ),
    )
  } catch (e) {
    return voiceFailure(e)
  }
}
