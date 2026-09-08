import { timingSafeEqual } from 'node:crypto'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  voiceJson,
  drainVoiceMediaOutbox,
  voiceFailure,
} from '@/lib/voice/server'
export const maxDuration = 60
export async function POST(request: Request) {
  const expected =
      request.method === 'GET'
        ? process.env.CRON_SECRET
        : process.env.VOICE_WORKER_SECRET || process.env.CRON_SECRET,
    actual = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (
    !expected ||
    !actual ||
    Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return voiceJson({ error: 'forbidden' }, 403)
  try {
    const admin = createSupabaseAdminClient()
    if (!admin) throw new Error('service_unavailable')
    const { data, error } = await admin.rpc('sweep_voice_sessions')
    if (error) throw new Error('service_unavailable')
    const cleanup = await drainVoiceMediaOutbox()
    return voiceJson({ ...data, ...cleanup }, cleanup.pending ? 503 : 200)
  } catch (e) {
    return voiceFailure(e)
  }
}
// Vercel invokes Cron endpoints using an authenticated GET; public page GETs cannot pass this secret guard.
export const GET = POST
