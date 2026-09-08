import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { toPublicErrorCode } from '@/lib/api/public-error'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try { assertTrustedMutationOrigin(req) } catch (error) {
    return NextResponse.json({ error: 'request_not_allowed' }, { status: error instanceof TrustedOriginError ? error.status : 403, headers: { 'Cache-Control': 'private, no-store' } })
  }
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 수신자가 status='declined' 로 update. guard_friend_requests_update trigger 가 검증.
  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status: 'declined' })
    .eq('id', params.id)
    .eq('receiver_user_id', user.id)
    .select('id,status')
    .maybeSingle()

  if (error) {
    const retryable = error.code === '40001' || error.message.includes('friend_pair_retryable')
    return NextResponse.json({
      error: retryable ? 'friend_pair_retryable' : toPublicErrorCode(error.message, 'decline_failed'),
    }, { status: retryable ? 409 : 400 })
  }
  if (!data) {
    return NextResponse.json({ error: 'request_not_found_or_not_receiver' }, { status: 404 })
  }

  return NextResponse.json({ request: data })
}
