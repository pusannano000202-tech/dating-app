import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isUuid(params.id)) return NextResponse.json({ error: 'invalid_proposal_id' }, { status: 400 })

  const { error } = await supabase.rpc('cancel_friend_date_proposal', { p_proposal_id: params.id })
  if (error) {
    const code = error.message?.includes('proposal_not_pending_or_forbidden')
      ? 'proposal_not_pending_or_forbidden'
      : 'friend_date_cancel_failed'
    return NextResponse.json({ error: code }, { status: code === 'proposal_not_pending_or_forbidden' ? 409 : 400 })
  }

  return NextResponse.json({ ok: true })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
