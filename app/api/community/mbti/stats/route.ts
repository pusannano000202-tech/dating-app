import { readPublicMbtiSnapshot } from '@/lib/community/mbti/snapshot.server'

import { mbtiPublicJson } from '../_response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return mbtiPublicJson(await readPublicMbtiSnapshot())
  } catch {
    return mbtiPublicJson({ error: 'stats_unavailable' }, 503)
  }
}
