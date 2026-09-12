import { NextRequest } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'
import { isSupabaseConfigured } from '@/lib/utils'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { meetupJson } from '@/lib/meetups/http'
import { readStudyRoomBody } from '@/lib/meetups/study-room-server'
import { groupMentoringError, parseGroupMentoringCommand, parseGroupMentoringSnapshot } from '@/lib/mentoring/group-contract'

async function rpc(req: NextRequest, action: string, args: Record<string, unknown>) {
  if (!isCommunityFeatureEnabled() || !isSupabaseConfigured()) return meetupJson({ error: 'unavailable' }, 503)
  try {
    const client = createSupabaseRequestClient(req)
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError && ![400, 401, 403].includes(authError.status ?? 0)) return meetupJson({ error: 'unavailable' }, 503)
    if (!user) return meetupJson({ error: 'auth_required' }, 401)
    const { data, error } = await client.rpc('mentoring_group_action', { p_action: action, p_args: args })
    if (error) { const problem = groupMentoringError(error); return meetupJson({ error: problem.error }, problem.status) }
    const parsed = parseGroupMentoringSnapshot(data)
    return parsed ? meetupJson({ data: parsed }) : meetupJson({ error: 'unavailable' }, 503)
  } catch { return meetupJson({ error: 'unavailable' }, 503) }
}

export async function GET(req: NextRequest) { return rpc(req, 'status', {}) }
export async function POST(req: NextRequest) {
  try { assertTrustedMutationOrigin(req) }
  catch (error) { return meetupJson({ error: 'forbidden' }, error instanceof TrustedOriginError ? error.status : 403) }
  const command = parseGroupMentoringCommand(await readStudyRoomBody(req))
  // New participation requires an explicit hosted room + paid application.
  // Preserve already issued party/session consent, messages, cancellation and reports.
  if (command?.action === 'join') return meetupJson({ error: 'approval_required' }, 409)
  return command ? rpc(req, command.action, command.args) : meetupJson({ error: 'invalid' }, 400)
}
