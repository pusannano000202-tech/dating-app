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

  const { data, error } = await supabase
    .rpc('cancel_friend_request', { p_request_id: params.id })
    .maybeSingle()

  if (error) {
    const retryable = error.code === '40001' || error.message.includes('friend_pair_retryable')
    return NextResponse.json({
      error: retryable ? 'friend_pair_retryable' : toPublicErrorCode(error.message, 'cancel_failed'),
    }, { status: retryable ? 409 : 400 })
  }

  return NextResponse.json({ result: data })
}
