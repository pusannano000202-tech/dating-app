import { NextResponse } from 'next/server'

import {
  getTonightWebPushConfig,
  isTonightWebPushReady,
} from '@/lib/notifications/tonight-contract'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = getTonightWebPushConfig(process.env)
  if (!isTonightWebPushReady(config)) {
    return NextResponse.json({ enabled: false, reason: 'not_configured' })
  }

  const { data: ready, error } = await supabase.rpc('get_my_tonight_push_readiness')
  if (error) {
    return NextResponse.json({ enabled: false, reason: 'setup_required' }, { status: 503 })
  }
  if (ready !== true) {
    return NextResponse.json({ enabled: false, reason: 'tonight_access_required' })
  }

  return NextResponse.json({ enabled: true, publicKey: config.publicKey })
}
