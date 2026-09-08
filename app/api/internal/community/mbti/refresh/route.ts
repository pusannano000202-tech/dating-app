import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { refreshPublicMbtiSnapshot } from '@/lib/community/mbti/snapshot.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return json({ error: 'service_unavailable' }, 503)
  if (!isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) {
    return json({ error: 'unauthorized' }, 401)
  }
  try {
    const snapshot = await refreshPublicMbtiSnapshot()
    return json({
      generatedAt: snapshot.generatedAt,
      expiresAt: snapshot.expiresAt,
      status: snapshot.selfReported.status,
      meetingStatsStatus: snapshot.meetingStats.status,
    })
  } catch {
    return json({ error: 'service_unavailable' }, 503)
  }
}
